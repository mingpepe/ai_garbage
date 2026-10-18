#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <sched.h>
#include <sys/wait.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <sys/sysmacros.h>
#include <limits.h>
#include <fcntl.h>

#define STACK_SIZE (1024 * 1024)    /* 1MB stack for cloned child */
#define CGROUP_NAME "min_container"

/* Structure to pass configuration into child process */
struct container_config {
    const char *rootfs;
    char **argv;
    int sync_pipe[2]; /* Pipe used to synchronize parent & child */
};

/* Helper syscall wrapper for pivot_root (glibc doesn't provide one) */
static int pivot_root(const char *new_root, const char *put_old) {
    return syscall(SYS_pivot_root, new_root, put_old);
}

/* Helper to write string to a file */
static int write_file(const char *path, const char *content) {
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) {
        return -1;
    }
    ssize_t len = write(fd, content, strlen(content));
    close(fd);
    return (len == (ssize_t)strlen(content)) ? 0 : -1;
}

/* 
 * =========================================================================
 * 1. Control Groups (Cgroups) 資源限制
 * =========================================================================
 * 限制容器內進程的資源消耗：
 * - pids.max: 限制進程總數（防止 Fork Bomb 癱瘓主機）
 * - memory.limit_in_bytes / memory.max: 限制最大記憶體使用量（防止 OOM 耗盡主機）
 */
static void setup_cgroups(pid_t pid) {
    char path[256];
    char pid_str[32];
    snprintf(pid_str, sizeof(pid_str), "%d", pid);

    printf("[Parent] 設定 Cgroups 資源限制...\n");

    /* 嘗試 Cgroup v2 (Unified Hierarchy) */
    snprintf(path, sizeof(path), "/sys/fs/cgroup/%s", CGROUP_NAME);
    if (mkdir(path, 0755) == 0 || errno == EEXIST) {
        char file_path[512];

        /* 限制最多 20 個進程 (防止 fork bomb) */
        snprintf(file_path, sizeof(file_path), "%s/pids.max", path);
        write_file(file_path, "20");

        /* 限制記憶體 64MB */
        snprintf(file_path, sizeof(file_path), "%s/memory.max", path);
        write_file(file_path, "67108864");

        /* 將容器 PID 加入 cgroup */
        snprintf(file_path, sizeof(file_path), "%s/cgroup.procs", path);
        if (write_file(file_path, pid_str) == 0) {
            printf("[Parent] 成功套用 Cgroup v2 (PIDs: max 20, Memory: max 64MB)\n");
            return;
        }
    }

    /* 若 Cgroup v2 不可用，退回支援 Cgroup v1 */
    /* 1. 限制進程數量 (pids controller) */
    snprintf(path, sizeof(path), "/sys/fs/cgroup/pids/%s", CGROUP_NAME);
    if (mkdir(path, 0755) == 0 || errno == EEXIST) {
        char file_path[512];
        snprintf(file_path, sizeof(file_path), "%s/pids.max", path);
        write_file(file_path, "20");

        snprintf(file_path, sizeof(file_path), "%s/tasks", path);
        write_file(file_path, pid_str);
    }

    /* 2. 限制記憶體使用量 (memory controller) - 64MB */
    snprintf(path, sizeof(path), "/sys/fs/cgroup/memory/%s", CGROUP_NAME);
    if (mkdir(path, 0755) == 0 || errno == EEXIST) {
        char file_path[512];
        snprintf(file_path, sizeof(file_path), "%s/memory.limit_in_bytes", path);
        write_file(file_path, "67108864");

        snprintf(file_path, sizeof(file_path), "%s/tasks", path);
        write_file(file_path, pid_str);
    }

    printf("[Parent] 已嘗試套用 Cgroup v1 (若未具備 root 權限則可能被略過)\n");
}

static void cleanup_cgroups(void) {
    char path[256];
    snprintf(path, sizeof(path), "/sys/fs/cgroup/%s", CGROUP_NAME);
    rmdir(path);

    snprintf(path, sizeof(path), "/sys/fs/cgroup/pids/%s", CGROUP_NAME);
    rmdir(path);

    snprintf(path, sizeof(path), "/sys/fs/cgroup/memory/%s", CGROUP_NAME);
    rmdir(path);
}

/* 
 * =========================================================================
 * 2. 檔案系統與掛載點隔離 (Mount Namespace + pivot_root)
 * =========================================================================
 * 為什麼要用 pivot_root 取代傳統的 chroot？
 * - chroot 只是更改當前進程的 root 目錄路徑，若進程有 CAP_SYS_CHROOT 權限，
 *   可以透過開啟外部目錄的 fd 搭配 fchdir + chroot 輕易「逃逸 (Jailbreak)」。
 * - pivot_root 是真正把整個系統的 root 掛載點換掉，舊的 root 會被卸載 (umount)，
 *   容器進程完全無法向上追溯到宿主機的真實根目錄。
 */
static void setup_mounts(const char *rootfs) {
    char old_root[512];
    snprintf(old_root, sizeof(old_root), "%s/.old_root", rootfs);

    /* 將所有掛載標記為 private，防止容器內的 mount/umount 洩漏到主機 (mount propagation) */
    if (mount(NULL, "/", NULL, MS_REC | MS_PRIVATE, NULL) < 0) {
        perror("[Child] mount private / 失敗");
    }

    /* pivot_root 要求 new_root 必須是一個獨立的 mount point，因此將 rootfs bind mount 到自己 */
    if (mount(rootfs, rootfs, "bind", MS_BIND | MS_REC, NULL) < 0) {
        perror("[Child] bind mount rootfs 失敗");
        exit(EXIT_FAILURE);
    }

    /* 建立放置舊 root 的暫存目錄 */
    mkdir(old_root, 0700);

    /* 交換根目錄：現在 rootfs 成為新的 /，舊的宿主機根目錄被移到 /.old_root */
    if (pivot_root(rootfs, old_root) < 0) {
        perror("[Child] pivot_root 失敗 (可檢查 rootfs 是否為有效目錄)");
        exit(EXIT_FAILURE);
    }

    /* 切換目前工作目錄到新的 / */
    if (chdir("/") < 0) {
        perror("[Child] chdir / 失敗");
        exit(EXIT_FAILURE);
    }

    /* 
     * 掛載虛擬檔案系統：
     * 1. /proc: PID Namespace 必備！若不掛載新的 procfs，ps 命令看到的仍然會是宿主機進程！
     * 2. /sys: 核心系統資訊
     * 3. /tmp: 容器專屬暫存記憶體檔案系統 (tmpfs)
     */
    mkdir("/proc", 0755);
    if (mount("proc", "/proc", "proc", 0, NULL) < 0) {
        perror("[Child] 掛載 /proc 失敗");
    }

    mkdir("/sys", 0755);
    mount("sysfs", "/sys", "sysfs", 0, NULL);

    mkdir("/tmp", 0777);
    mount("tmpfs", "/tmp", "tmpfs", 0, NULL);

    /* 掛載獨立乾淨的 /dev (避免容器直接看到 host 的 sda, nvme 等真實硬碟) */
    mkdir("/dev", 0755);
    mount("tmpfs", "/dev", "tmpfs", MS_NOSUID | MS_NOEXEC, "mode=755");
    mknod("/dev/null", S_IFCHR | 0666, makedev(1, 3));
    mknod("/dev/zero", S_IFCHR | 0666, makedev(1, 5));
    mknod("/dev/random", S_IFCHR | 0666, makedev(1, 8));
    mknod("/dev/urandom", S_IFCHR | 0666, makedev(1, 9));

    /* 卸載並刪除舊的根目錄，徹底斷絕訪問宿主機檔案系統的可能 */
    if (umount2("/.old_root", MNT_DETACH) < 0) {
        perror("[Child] umount /.old_root 失敗");
    }
    rmdir("/.old_root");
}

/* 
 * =========================================================================
 * 3. 容器子進程的主體函式 (Container Child Entry Point)
 * =========================================================================
 * 在透過 clone() 建立的全新 Namespaces 環境中執行。
 */
static int container_child(void *arg) {
    struct container_config *config = (struct container_config *)arg;

    /* 等待父進程配置好 Cgroups 後通知，避免子進程提早執行逃脫限制 */
    close(config->sync_pipe[1]);
    char ch;
    if (read(config->sync_pipe[0], &ch, 1) != 1) {
        fprintf(stderr, "[Child] 同步管道讀取失敗\n");
        exit(EXIT_FAILURE);
    }
    close(config->sync_pipe[0]);

    printf("[Child] 容器啟動！當前 PID (在容器內): %d\n", getpid());

    /* 
     * UTS Namespace: 設定容器專屬的主機名稱
     * 容器內改主機名完全不會影響外層 Host
     */
    if (sethostname("min-container", 13) < 0) {
        perror("[Child] sethostname 失敗");
    }

    /* 設置檔案系統隔離與專屬 procfs */
    setup_mounts(config->rootfs);

    printf("[Child] 正在執行應用程式: %s\n", config->argv[0]);
    printf("====================================================\n");

    /* 執行目標程式，替換掉當前進程映像 (例如 /bin/sh) */
    execvp(config->argv[0], config->argv);

    /* 若 execvp 失敗才會走到這裡 */
    perror("[Child] execvp 執行失敗");
    return EXIT_FAILURE;
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        fprintf(stderr, "用法: %s <rootfs_path> <command> [args...]\n", argv[0]);
        fprintf(stderr, "範例: sudo %s ./rootfs /bin/sh\n", argv[0]);
        return EXIT_FAILURE;
    }

    char abs_rootfs[PATH_MAX];
    if (realpath(argv[1], abs_rootfs) == NULL) {
        perror("[Parent] 無法解析 rootfs 路徑");
        return EXIT_FAILURE;
    }
    const char *rootfs = abs_rootfs;
    char **child_argv = &argv[2];

    /* 為 clone() 分配子進程的堆疊記憶體 */
    char *stack = mmap(NULL, STACK_SIZE,
                       PROT_READ | PROT_WRITE,
                       MAP_PRIVATE | MAP_ANONYMOUS | MAP_STACK,
                       -1, 0);
    if (stack == MAP_FAILED) {
        perror("[Parent] 堆疊記憶體分配失敗");
        return EXIT_FAILURE;
    }
    char *stack_top = stack + STACK_SIZE;

    struct container_config config;
    config.rootfs = rootfs;
    config.argv = child_argv;

    if (pipe(config.sync_pipe) < 0) {
        perror("[Parent] pipe 建立失敗");
        return EXIT_FAILURE;
    }

    /*
     * =====================================================================
     * Linux Namespaces (命名空間) 隔離標誌：
     * =====================================================================
     * - CLONE_NEWUTS: 隔離主機名稱 (Hostname) 與域名
     * - CLONE_NEWPID: 隔離進程空間 (容器進程成為 PID 1，看不到宿主機其他進程)
     * - CLONE_NEWNS:  隔離檔案系統掛載點 (Mount table)
     * - CLONE_NEWNET: 隔離網路設備、IP、路由表、連接埠
     * - CLONE_NEWIPC: 隔離 IPC 通訊 (共享記憶體、訊息佇列、信號量)
     * - SIGCHLD:      子進程結束時向父進程發送 SIGCHLD
     */
    int clone_flags = CLONE_NEWUTS |
                      CLONE_NEWPID |
                      CLONE_NEWNS  |
                      CLONE_NEWNET |
                      CLONE_NEWIPC |
                      SIGCHLD;

    printf("[Parent] 建立隔離的容器子進程 (調用 clone)...\n");
    pid_t child_pid = clone(container_child, stack_top, clone_flags, &config);
    if (child_pid < 0) {
        perror("[Parent] clone 失敗 (請確保以 sudo/root 身份執行)");
        return EXIT_FAILURE;
    }

    printf("[Parent] 容器進程在主機上的 PID: %d\n", child_pid);

    /* 設定 Cgroups 限制 (CPU/記憶體/進程數) */
    setup_cgroups(child_pid);

    /* 發送通知給子進程，允許其繼續執行 */
    close(config.sync_pipe[0]);
    if (write(config.sync_pipe[1], "GO", 1) != 1) {
        perror("[Parent] 寫入同步管道失敗");
    }
    close(config.sync_pipe[1]);

    /* 父進程等待容器結束 */
    int status;
    waitpid(child_pid, &status, 0);

    /* 清理 Cgroups */
    cleanup_cgroups();

    printf("\n[Parent] 容器已退出 (狀態碼: %d)。清理完成。\n", WEXITSTATUS(status));
    return WEXITSTATUS(status);
}
