using System.Text;

namespace MiniGit.Core;

/*
 * ============================================================================
 *                    REPOSITORY GRAPH & BRANCH REFERENCES
 * ============================================================================
 *
 * How Git tracks history:
 *
 *                               +-------------------------+
 *                               |       HEAD file         |
 *                               | "ref: refs/heads/main"  |
 *                               +------------+------------+
 *                                            |
 *                                            v
 *                               +-------------------------+
 *                               |   refs/heads/main file  |
 *                               |   Commit SHA: [C2]      |
 *                               +------------+------------+
 *                                            |
 *                                            v
 *                                    +---------------+
 *                                    |  Commit: C2   |
 *                                    |  parent: C1   |-----\
 *                                    |  tree:   T2   |     |
 *                                    +-------+-------+     |
 *                                            |             v
 *                                            |      +---------------+
 *                                            |      |  Commit: C1   | (Initial)
 *                                            |      |  parent: none |
 *                                            |      |  tree:   T1   |
 *                                            |      +-------+-------+
 *                                            |              |
 *                                            v              v
 *                                       [ Tree: T2 ]   [ Tree: T1 ]
 *                                            |              |
 *                                      +-----+-----+    (blobs...)
 *                                      |           |
 *                                      v           v
 *                                  [Blob: B2]  [Tree: T_sub]
 *                                 ("main.cs")      |
 *                                                  v
 *                                             [Blob: B1]
 *                                            ("util.cs")
 *
 * ============================================================================
 *                              COMMIT PIPELINE
 * ============================================================================
 *
 *  1. Working Directory ---> Scan files & folders recursively
 *  2. Blobs             ---> For each file, create Blob and write to ObjectStore
 *  3. Trees             ---> For each folder, create Tree of Blobs/Sub-Trees
 *  4. Root Tree         ---> Obtains top-level Tree hash representing the snapshot
 *  5. Parent Commit     ---> Read current HEAD to find parent commit hash
 *  6. Commit Object     ---> Create commit (RootTree, Parent, Author, Message)
 *  7. Update Ref        ---> Write new commit hash into current branch or HEAD
 *
 * ============================================================================
 *                             CHECKOUT MECHANISM
 * ============================================================================
 *
 *  Case A: Branch Checkout ("minigit checkout dev")
 *    1. Target branch ref exists: .minigit/refs/heads/dev
 *    2. HEAD updated to: "ref: refs/heads/dev"
 *    3. Working directory files restored from commit pointed to by "dev".
 *
 *  Case B: Detached HEAD Checkout ("minigit checkout c1a2b3")
 *    1. Target is a commit hash (or prefix).
 *    2. HEAD updated to direct commit hash: "c1a2b3..."
 *    3. Working directory files restored from that commit.
 *
 * ============================================================================
 */

/// <summary>
/// Represents a local Git repository, orchestrating objects, branches, HEAD, and working tree files.
/// </summary>
public sealed class Repository
{
    public string WorkTreePath { get; }
    public string GitDirPath { get; }
    public ObjectStore Store { get; }

    // Standard ignored folders and files
    private static readonly HashSet<string> IgnoredDirectories = new(StringComparer.OrdinalIgnoreCase)
    {
        ".minigit",
        ".git",
        "bin",
        "obj",
        ".vs",
        ".idea",
        ".vscode"
    };

    private static readonly HashSet<string> IgnoredExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".user",
        ".suo"
    };

    public Repository(string workTreePath)
    {
        WorkTreePath = Path.GetFullPath(workTreePath);
        GitDirPath = Path.Combine(WorkTreePath, ".minigit");
        Store = new ObjectStore(GitDirPath);
    }

    /// <summary>
    /// Checks if a MiniGit repository exists at the target directory.
    /// </summary>
    public bool Exists()
    {
        return Directory.Exists(GitDirPath) &&
               Directory.Exists(Path.Combine(GitDirPath, "objects")) &&
               Directory.Exists(Path.Combine(GitDirPath, "refs", "heads")) &&
               File.Exists(Path.Combine(GitDirPath, "HEAD"));
    }

    /// <summary>
    /// Initializes a new repository:
    /// .minigit/
    ///   ├── HEAD (points to refs/heads/main)
    ///   ├── objects/
    ///   └── refs/heads/
    /// </summary>
    public void Init()
    {
        if (Exists())
        {
            Console.WriteLine($"Reinitialized existing MiniGit repository in {GitDirPath}");
            return;
        }

        Directory.CreateDirectory(GitDirPath);
        Directory.CreateDirectory(Path.Combine(GitDirPath, "objects"));
        Directory.CreateDirectory(Path.Combine(GitDirPath, "refs", "heads"));

        // Default branch is 'main'
        File.WriteAllText(Path.Combine(GitDirPath, "HEAD"), "ref: refs/heads/main\n");

        Console.WriteLine($"Initialized empty MiniGit repository in {GitDirPath}");
    }

    /// <summary>
    /// Snapshots the current working directory, creates Blob/Tree objects,
    /// constructs a Commit object pointing to the root Tree and parent commit,
    /// and advances the active branch or HEAD.
    /// </summary>
    public string Commit(string message, string author = "User <user@local>")
    {
        EnsureRepoInitialized();

        if (string.IsNullOrWhiteSpace(message))
        {
            throw new ArgumentException("Commit message cannot be empty.", nameof(message));
        }

        // 1. Recursively snapshot working directory into Blobs and Trees
        string rootTreeHash = WriteDirectoryTree(WorkTreePath);

        // 2. Resolve parent commit from current HEAD
        string? parentCommitHash = GetHeadCommitHash();

        // 3. Check if tree has changed since parent commit
        if (parentCommitHash != null)
        {
            var parentCommit = (CommitObject)Store.ReadObject(parentCommitHash);
            if (parentCommit.TreeHash == rootTreeHash)
            {
                Console.WriteLine("On branch " + GetCurrentBranchOrDetached());
                Console.WriteLine("nothing to commit, working tree clean");
                return parentCommitHash;
            }
        }

        // 4. Create Commit object
        string timestamp = DateTimeOffset.UtcNow.ToString("o");
        var commit = new CommitObject
        {
            TreeHash = rootTreeHash,
            ParentHash = parentCommitHash,
            Author = $"{author} {timestamp}",
            Committer = $"{author} {timestamp}",
            Message = message
        };

        // 5. Save commit object to object database
        string commitHash = Store.WriteObject(commit);

        // 6. Advance branch pointer or update detached HEAD
        UpdateHeadReference(commitHash);

        string branchName = GetCurrentBranchOrDetached();
        Console.WriteLine($"[{branchName} (root-commit {commitHash[..7]})] {message}");
        return commitHash;
    }

    /// <summary>
    /// Restores working tree files to match the snapshot of the specified commit or branch,
    /// and updates HEAD accordingly.
    /// </summary>
    public void Checkout(string target)
    {
        EnsureRepoInitialized();

        string? targetBranch = null;
        string targetCommitHash;

        string branchRefPath = Path.Combine(GitDirPath, "refs", "heads", target);
        if (File.Exists(branchRefPath))
        {
            // Case A: Target is a branch name
            targetBranch = target;
            string branchContent = File.ReadAllText(branchRefPath).Trim();
            if (string.IsNullOrEmpty(branchContent))
            {
                throw new InvalidOperationException($"Branch '{target}' does not point to any commit.");
            }
            targetCommitHash = branchContent;
        }
        else
        {
            // Case B: Target is a commit hash (or short prefix)
            targetCommitHash = Store.ResolveHash(target);
        }

        // Load the commit object and root tree
        var targetCommit = Store.ReadObject(targetCommitHash) as CommitObject
            ?? throw new InvalidOperationException($"Object '{targetCommitHash}' is not a commit.");

        // Step 1: Collect files tracked in current commit to cleanly swap them
        string? currentCommitHash = GetHeadCommitHash();
        Dictionary<string, string> currentTrackedFiles = new();
        if (currentCommitHash != null)
        {
            var currentCommit = (CommitObject)Store.ReadObject(currentCommitHash);
            currentTrackedFiles = CollectTrackedFiles(currentCommit.TreeHash);
        }

        // Step 2: Collect files in target commit
        Dictionary<string, string> targetTrackedFiles = CollectTrackedFiles(targetCommit.TreeHash);

        // Step 3: Remove old tracked files that do not exist in the new commit
        foreach (var relativePath in currentTrackedFiles.Keys)
        {
            if (!targetTrackedFiles.ContainsKey(relativePath))
            {
                string fullPath = Path.Combine(WorkTreePath, relativePath);
                if (File.Exists(fullPath))
                {
                    File.Delete(fullPath);
                    CleanupEmptyDirectories(Path.GetDirectoryName(fullPath));
                }
            }
        }

        // Step 4: Write all files from target commit to working tree
        foreach (var (relativePath, blobHash) in targetTrackedFiles)
        {
            string fullPath = Path.Combine(WorkTreePath, relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

            var blob = (BlobObject)Store.ReadObject(blobHash);
            File.WriteAllBytes(fullPath, blob.Content);
        }

        // Step 5: Update HEAD
        string headPath = Path.Combine(GitDirPath, "HEAD");
        if (targetBranch != null)
        {
            // Switched to branch
            File.WriteAllText(headPath, $"ref: refs/heads/{targetBranch}\n");
            Console.WriteLine($"Switched to branch '{targetBranch}'");
        }
        else
        {
            // Detached HEAD state
            File.WriteAllText(headPath, $"{targetCommitHash}\n");
            Console.WriteLine($"Note: switching to '{targetCommitHash[..7]}'.");
            Console.WriteLine("You are in 'detached HEAD' state (pointing directly to a commit).");
        }

        Console.WriteLine($"HEAD is now at {targetCommitHash[..7]} {targetCommit.Message.Split('\n')[0]}");
    }

    /// <summary>
    /// Displays commit history starting from current HEAD and traversing parent pointers backward.
    /// </summary>
    public void Log()
    {
        EnsureRepoInitialized();

        string? currentHash = GetHeadCommitHash();
        if (currentHash == null)
        {
            Console.WriteLine("fatal: your current branch does not have any commits yet");
            return;
        }

        string branchName = GetCurrentBranchOrDetached();
        bool isFirst = true;

        /*
         * Commit History Graph Visualization:
         *
         *  * commit 4a123f... (HEAD -> main)
         *  | Author: User <user@local> 2026-10-23
         *  | Tree:   8b2734...
         *  |
         *  |     Commit message
         *  |
         *  * commit 19b22a...
         *  | Author: ...
         */

        while (currentHash != null)
        {
            var commit = (CommitObject)Store.ReadObject(currentHash);

            string headDecoration = isFirst ? $" (HEAD -> {branchName})" : "";
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"* commit {currentHash}{headDecoration}");
            Console.ResetColor();

            Console.WriteLine($"| Author: {commit.Author}");
            Console.WriteLine($"| Tree:   {commit.TreeHash}");
            if (!string.IsNullOrWhiteSpace(commit.ParentHash))
            {
                Console.WriteLine($"| Parent: {commit.ParentHash}");
            }
            Console.WriteLine("|");

            foreach (var line in commit.Message.Split('\n'))
            {
                Console.WriteLine($"|     {line}");
            }
            Console.WriteLine("|");

            currentHash = commit.ParentHash;
            isFirst = false;
        }
    }

    /// <summary>
    /// Inspects and displays the content of any object in the database (Blob, Tree, Commit).
    /// Similar to 'git cat-file -p <hash>'.
    /// </summary>
    public void CatFile(string hashOrPrefix)
    {
        EnsureRepoInitialized();

        var (fullHash, _) = Store.ReadRawObject(hashOrPrefix);
        var obj = Store.ReadObject(fullHash);

        Console.WriteLine($"[Object {fullHash}] Type: {obj.Type}");
        Console.WriteLine(new string('-', 60));

        switch (obj)
        {
            case BlobObject blob:
                Console.WriteLine(Encoding.UTF8.GetString(blob.Content));
                break;

            case TreeObject tree:
                foreach (var entry in tree.Entries)
                {
                    Console.WriteLine($"{entry.Mode} {entry.Type.ToString().ToLowerInvariant()} {entry.Hash}  {entry.Name}");
                }
                break;

            case CommitObject commit:
                Console.WriteLine($"tree {commit.TreeHash}");
                if (!string.IsNullOrEmpty(commit.ParentHash))
                {
                    Console.WriteLine($"parent {commit.ParentHash}");
                }
                Console.WriteLine($"author {commit.Author}");
                Console.WriteLine($"committer {commit.Committer}\n");
                Console.WriteLine(commit.Message);
                break;
        }
        Console.WriteLine(new string('-', 60));
    }

    /// <summary>
    /// Creates a new branch pointing to current HEAD, or lists all branches.
    /// </summary>
    public void Branch(string? newBranchName = null)
    {
        EnsureRepoInitialized();

        string headsDir = Path.Combine(GitDirPath, "refs", "heads");

        if (string.IsNullOrWhiteSpace(newBranchName))
        {
            // List branches
            string currentBranch = GetCurrentBranchOrDetached();
            var branches = Directory.GetFiles(headsDir).Select(Path.GetFileName).ToList();

            foreach (var b in branches)
            {
                if (b == currentBranch)
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine($"* {b}");
                    Console.ResetColor();
                }
                else
                {
                    Console.WriteLine($"  {b}");
                }
            }
            return;
        }

        // Create new branch
        string? currentCommit = GetHeadCommitHash();
        if (currentCommit == null)
        {
            throw new InvalidOperationException("Cannot create branch: No commits exist yet.");
        }

        string newBranchPath = Path.Combine(headsDir, newBranchName);
        if (File.Exists(newBranchPath))
        {
            throw new InvalidOperationException($"A branch named '{newBranchName}' already exists.");
        }

        File.WriteAllText(newBranchPath, currentCommit + "\n");
        Console.WriteLine($"Created branch '{newBranchName}' at {currentCommit[..7]}");
    }

    /// <summary>
    /// Shows current repository status: active branch/HEAD and commit.
    /// </summary>
    public void Status()
    {
        EnsureRepoInitialized();

        string branchName = GetCurrentBranchOrDetached();
        string? headCommit = GetHeadCommitHash();

        Console.WriteLine($"On branch: {branchName}");
        if (headCommit == null)
        {
            Console.WriteLine("No commits yet.");
        }
        else
        {
            var commit = (CommitObject)Store.ReadObject(headCommit);
            Console.WriteLine($"Latest commit: {headCommit[..7]} - {commit.Message.Split('\n')[0]}");
        }
    }

    // =========================================================================
    //                        INTERNAL HELPERS
    // =========================================================================

    /// <summary>
    /// Recursively snapshots a directory into Tree and Blob objects in the ObjectStore.
    /// Returns the SHA-1 hash of the resulting Tree object.
    /// </summary>
    private string WriteDirectoryTree(string dirPath)
    {
        var entries = new List<TreeEntry>();

        // 1. Process files in current directory -> create Blobs
        foreach (var filePath in Directory.GetFiles(dirPath))
        {
            string fileName = Path.GetFileName(filePath);
            if (IgnoredExtensions.Contains(Path.GetExtension(fileName)))
            {
                continue;
            }

            byte[] fileBytes = File.ReadAllBytes(filePath);
            var blob = new BlobObject(fileBytes);
            string blobHash = Store.WriteObject(blob);

            // Normal file mode in Git: 100644
            entries.Add(new TreeEntry("100644", GitObjectType.Blob, blobHash, fileName));
        }

        // 2. Process subdirectories -> recursively create Sub-Trees
        foreach (var subDirPath in Directory.GetDirectories(dirPath))
        {
            string dirName = Path.GetFileName(subDirPath);
            if (IgnoredDirectories.Contains(dirName))
            {
                continue;
            }

            string subTreeHash = WriteDirectoryTree(subDirPath);

            // Only add subtree entry if the directory is not completely empty
            var subTree = (TreeObject)Store.ReadObject(subTreeHash);
            if (subTree.Entries.Count > 0)
            {
                // Directory mode in Git: 040000
                entries.Add(new TreeEntry("040000", GitObjectType.Tree, subTreeHash, dirName));
            }
        }

        var tree = new TreeObject(entries);
        return Store.WriteObject(tree);
    }

    /// <summary>
    /// Recursively flattens a Tree object into a dictionary of "relative/path" -> blobHash.
    /// </summary>
    private Dictionary<string, string> CollectTrackedFiles(string treeHash, string prefix = "")
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var tree = (TreeObject)Store.ReadObject(treeHash);

        foreach (var entry in tree.Entries)
        {
            string relativePath = string.IsNullOrEmpty(prefix) ? entry.Name : Path.Combine(prefix, entry.Name);

            if (entry.Type == GitObjectType.Blob)
            {
                result[relativePath] = entry.Hash;
            }
            else if (entry.Type == GitObjectType.Tree)
            {
                var subFiles = CollectTrackedFiles(entry.Hash, relativePath);
                foreach (var kvp in subFiles)
                {
                    result[kvp.Key] = kvp.Value;
                }
            }
        }

        return result;
    }

    /// <summary>
    /// Resolves current HEAD to a commit SHA-1 (or null if repository has no commits).
    /// </summary>
    public string? GetHeadCommitHash()
    {
        string headPath = Path.Combine(GitDirPath, "HEAD");
        if (!File.Exists(headPath)) return null;

        string content = File.ReadAllText(headPath).Trim();

        // Symbolic ref: "ref: refs/heads/<branch>"
        if (content.StartsWith("ref: "))
        {
            string refRelativePath = content["ref: ".Length..].Trim();
            string refFullPath = Path.Combine(GitDirPath, refRelativePath);

            if (File.Exists(refFullPath))
            {
                string hash = File.ReadAllText(refFullPath).Trim();
                return string.IsNullOrEmpty(hash) ? null : hash;
            }

            return null; // Branch exists conceptually in HEAD, but has no commits yet
        }

        // Detached HEAD: direct commit SHA
        return string.IsNullOrEmpty(content) ? null : content;
    }

    /// <summary>
    /// Returns the active branch name (e.g. "main"), or "(detached HEAD at <hash>)".
    /// </summary>
    public string GetCurrentBranchOrDetached()
    {
        string headPath = Path.Combine(GitDirPath, "HEAD");
        if (!File.Exists(headPath)) return "unknown";

        string content = File.ReadAllText(headPath).Trim();
        if (content.StartsWith("ref: refs/heads/"))
        {
            return content["ref: refs/heads/".Length..].Trim();
        }

        return $"(detached at {content[..Math.Min(7, content.Length)]})";
    }

    /// <summary>
    /// Updates HEAD reference to point to a new commit hash.
    /// </summary>
    private void UpdateHeadReference(string newCommitHash)
    {
        string headPath = Path.Combine(GitDirPath, "HEAD");
        string content = File.ReadAllText(headPath).Trim();

        if (content.StartsWith("ref: "))
        {
            string refRelativePath = content["ref: ".Length..].Trim();
            string refFullPath = Path.Combine(GitDirPath, refRelativePath);

            Directory.CreateDirectory(Path.GetDirectoryName(refFullPath)!);
            File.WriteAllText(refFullPath, newCommitHash + "\n");
        }
        else
        {
            // Detached HEAD
            File.WriteAllText(headPath, newCommitHash + "\n");
        }
    }

    private void EnsureRepoInitialized()
    {
        if (!Exists())
        {
            throw new InvalidOperationException("Not a MiniGit repository (or any of the parent directories): .minigit");
        }
    }

    private void CleanupEmptyDirectories(string? dir)
    {
        while (!string.IsNullOrEmpty(dir) &&
               !string.Equals(dir, WorkTreePath, StringComparison.OrdinalIgnoreCase) &&
               Directory.Exists(dir))
        {
            if (Directory.GetFiles(dir).Length == 0 && Directory.GetDirectories(dir).Length == 0)
            {
                Directory.Delete(dir);
                dir = Path.GetDirectoryName(dir);
            }
            else
            {
                break;
            }
        }
    }
}
