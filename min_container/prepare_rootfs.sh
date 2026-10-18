#!/bin/bash
set -e

ROOTFS_DIR="$(cd "$(dirname "$0")" && pwd)/rootfs"

echo "=== 準備最小化 RootFS (使用 busybox) ==="
rm -rf "$ROOTFS_DIR"
mkdir -p "$ROOTFS_DIR"/{bin,sbin,usr/bin,usr/sbin,proc,sys,dev,tmp,etc}

if [ -f /bin/busybox ]; then
    cp /bin/busybox "$ROOTFS_DIR/bin/busybox"
    (
        cd "$ROOTFS_DIR/bin"
        # 使用相對連結 (ln -sf busybox cmd)，確保在容器 chroot/pivot_root 後路徑仍然有效
        for cmd in $(./busybox --list); do
            if [ "$cmd" != "busybox" ]; then
                ln -sf busybox "$cmd"
            fi
        done
    )
    # 也讓 /usr/bin 與 /sbin 的常用程式能找到
    (
        cd "$ROOTFS_DIR/usr/bin"
        ln -sf ../../bin/busybox env 2>/dev/null || true
    )
    echo "成功從 /bin/busybox 建立完整命令集 (使用相對連結)！"
else
    echo "錯誤: 系統找不到 /bin/busybox，請先安裝 busybox (例如 sudo apt install busybox-static)"
    exit 1
fi

echo "RootFS 準備完成: $ROOTFS_DIR"
