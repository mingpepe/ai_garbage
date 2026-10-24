using MiniGit.Core;

namespace MiniGit;

/*
 * ============================================================================
 *                             MINIGIT ARCHITECTURE
 * ============================================================================
 *
 *               +-------------------------------------------+
 *               |                WORKING TREE               |
 *               | (Your local files: README.md, src/, etc.) |
 *               +---------------------+---------------------+
 *                                     |
 *                            commit   |   checkout
 *                                     v   ^
 *               +-------------------------------------------+
 *               |               .minigit/                   |
 *               |                                           |
 *               |  +-- HEAD (points to refs/heads/main)     |
 *               |  |                                        |
 *               |  +-- refs/heads/main (holds commit hash)  |
 *               |  |                                        |
 *               |  +-- objects/ (Content Addressable Store) |
 *               |        |-- Commit (metadata + root tree)  |
 *               |        |-- Tree   (directories snapshot)  |
 *               |        \-- Blob   (file contents)         |
 *               +-------------------------------------------+
 * ============================================================================
 */

public static class Program
{
    public static void Main(string[] args)
    {
        if (args.Length == 0)
        {
            PrintUsage();
            return;
        }

        string command = args[0].ToLowerInvariant();
        var repo = new Repository(Directory.GetCurrentDirectory());

        try
        {
            switch (command)
            {
                case "init":
                    repo.Init();
                    break;

                case "commit":
                    HandleCommit(repo, args);
                    break;

                case "checkout":
                    HandleCheckout(repo, args);
                    break;

                case "log":
                    repo.Log();
                    break;

                case "status":
                    repo.Status();
                    break;

                case "branch":
                    string? branchName = args.Length > 1 ? args[1] : null;
                    repo.Branch(branchName);
                    break;

                case "cat-file":
                    HandleCatFile(repo, args);
                    break;

                case "demo":
                    RunEducationalDemo();
                    break;

                case "--help":
                case "-h":
                case "help":
                    PrintUsage();
                    break;

                default:
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"minigit: '{command}' is not a minigit command. See 'minigit --help'.");
                    Console.ResetColor();
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"Error: {ex.Message}");
            Console.ResetColor();
        }
    }

    private static void HandleCommit(Repository repo, string[] args)
    {
        string? message = null;

        for (int i = 1; i < args.Length; i++)
        {
            if ((args[i] == "-m" || args[i] == "--message") && i + 1 < args.Length)
            {
                message = args[i + 1];
                break;
            }
            else if (!args[i].StartsWith('-'))
            {
                message = args[i];
                break;
            }
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            Console.WriteLine("error: switch 'm' requires a value (e.g. minigit commit -m \"My message\")");
            return;
        }

        repo.Commit(message);
    }

    private static void HandleCheckout(Repository repo, string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("Usage: minigit checkout <branch-or-commit>");
            return;
        }

        string target = args[1];
        repo.Checkout(target);
    }

    private static void HandleCatFile(Repository repo, string[] args)
    {
        if (args.Length < 2)
        {
            Console.WriteLine("Usage: minigit cat-file -p <object-hash>");
            return;
        }

        string hash = args[^1];
        repo.CatFile(hash);
    }

    private static void PrintUsage()
    {
        Console.WriteLine(@"
+=============================================================================+
|                       MINIGIT - Educational Local Git                       |
+=============================================================================+

Usage: minigit <command> [<args>]

Core Commands:
  init                     Create an empty MiniGit repository (.minigit)
  commit -m <message>      Record a snapshot of the working directory
  checkout <branch|hash>   Switch branches or restore working tree to a commit
  log                      Show commit logs (with ASCII commit DAG graph)

Inspection & Helper Commands:
  status                   Show working tree and branch status
  branch [<name>]          List branches or create a new branch
  cat-file -p <hash>       Inspect the raw contents of any object (Blob/Tree/Commit)
  demo                     Run an end-to-end interactive demonstration walkthrough
");
    }

    /// <summary>
    /// Runs a self-contained demonstration showing how Git stores Blobs, Trees,
    /// Commits, branches, and performs checkouts.
    /// </summary>
    private static void RunEducationalDemo()
    {
        string demoDir = Path.Combine(Directory.GetCurrentDirectory(), "minigit_demo_workspace");

        if (Directory.Exists(demoDir))
        {
            Directory.Delete(demoDir, true);
        }

        Directory.CreateDirectory(demoDir);
        Console.WriteLine($"\n=== Starting MiniGit Demonstration in: {demoDir} ===\n");

        var demoRepo = new Repository(demoDir);

        // 1. Init
        Console.WriteLine(">>> 1. Initializing repository: minigit init");
        demoRepo.Init();
        Console.WriteLine();

        // 2. Create first files
        Console.WriteLine(">>> 2. Creating files: hello.txt and src/calculator.py");
        File.WriteAllText(Path.Combine(demoDir, "hello.txt"), "Hello, MiniGit!\n");
        Directory.CreateDirectory(Path.Combine(demoDir, "src"));
        File.WriteAllText(Path.Combine(demoDir, "src", "calculator.py"), "def add(a, b): return a + b\n");

        // 3. First commit
        Console.WriteLine("\n>>> 3. Creating Commit 1: minigit commit -m \"Initial commit\"");
        string commit1 = demoRepo.Commit("Initial commit");
        Console.WriteLine();

        // 4. Create second files & modify existing
        Console.WriteLine(">>> 4. Modifying hello.txt and creating docs/README.md");
        File.AppendAllText(Path.Combine(demoDir, "hello.txt"), "Added a second line!\n");
        Directory.CreateDirectory(Path.Combine(demoDir, "docs"));
        File.WriteAllText(Path.Combine(demoDir, "docs", "README.md"), "# Project Documentation\n");

        // 5. Second commit
        Console.WriteLine("\n>>> 5. Creating Commit 2: minigit commit -m \"Add docs and update hello.txt\"");
        string commit2 = demoRepo.Commit("Add docs and update hello.txt");
        Console.WriteLine();

        // 6. View log
        Console.WriteLine(">>> 6. Showing history: minigit log");
        demoRepo.Log();
        Console.WriteLine();

        // 7. Inspecting objects with cat-file
        var commitObj = (CommitObject)demoRepo.Store.ReadObject(commit2);
        Console.WriteLine($">>> 7. Inspecting Commit 2 object ({commit2[..7]}): minigit cat-file -p {commit2[..7]}");
        demoRepo.CatFile(commit2);
        Console.WriteLine();

        Console.WriteLine($">>> 8. Inspecting Root Tree object ({commitObj.TreeHash[..7]}): minigit cat-file -p {commitObj.TreeHash[..7]}");
        demoRepo.CatFile(commitObj.TreeHash);
        Console.WriteLine();

        // 8. Checkout back to commit 1
        Console.WriteLine($">>> 9. Checking out Commit 1 ({commit1[..7]}): minigit checkout {commit1[..7]}");
        demoRepo.Checkout(commit1[..7]);
        Console.WriteLine();

        Console.WriteLine("Content of hello.txt at Commit 1:");
        Console.WriteLine(File.ReadAllText(Path.Combine(demoDir, "hello.txt")));
        Console.WriteLine($"Does docs/README.md exist now? {File.Exists(Path.Combine(demoDir, "docs", "README.md"))}");
        Console.WriteLine();

        // 9. Checkout back to main
        Console.WriteLine(">>> 10. Checking out 'main' branch: minigit checkout main");
        demoRepo.Checkout("main");
        Console.WriteLine();

        Console.WriteLine("Content of hello.txt at main branch:");
        Console.WriteLine(File.ReadAllText(Path.Combine(demoDir, "hello.txt")));
        Console.WriteLine($"Does docs/README.md exist now? {File.Exists(Path.Combine(demoDir, "docs", "README.md"))}");
        Console.WriteLine();

        Console.WriteLine("=== Demonstration Completed Successfully! ===\n");
    }
}
