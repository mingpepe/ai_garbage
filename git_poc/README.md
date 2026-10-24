# MiniGit - Educational Local Git Implementation in C#

A readable, conceptual implementation of a local Git version control system built with C# and .NET. Designed for understanding the internal mechanics of Git without overwhelming complexity.

---

## 1. Core Principles & Architecture

Git is fundamentally a **Content-Addressable Object Store** combined with a **Directed Acyclic Graph (DAG)** of commits and references.

```
+-------------------------------------------------------------------------+
|                              MINIGIT DAG                                |
+-------------------------------------------------------------------------+
|                                                                         |
|   HEAD ---> refs/heads/main                                             |
|                     |                                                   |
|                     v                                                   |
|              [ Commit: c2 ]                                             |
|              |  tree:   t2   |                                          |
|              |  parent: c1   | -------> [ Commit: c1 ] (Initial)        |
|              +-------+-------+          |  tree:   t1   |               |
|                      |                  |  parent: none |               |
|                      v                  +-------+-------+               |
|                [ Tree: t2 ]                             |               |
|                |-- blob: b2 ("hello.txt")               v               |
|                \-- tree: t_sub ("src/")           [ Tree: t1 ]          |
|                           \-- blob: b3 ("app.py") (blobs...)            |
|                                                                         |
+-------------------------------------------------------------------------+
```

### 1.1 Object Storage (`.minigit/objects/`)
Every object is formatted as:
```
[type] [payload_length_in_bytes]\0[payload_bytes]
```
The **SHA-1** hash is computed over this full byte sequence. The resulting 40-character hex string determines its path on disk:
- First 2 characters: directory name
- Remaining 38 characters: file name

```
Hash: 557db03de997c86a4a028e1ebd3a1ceb225be238
Path: .minigit/objects/55/7db03de997c86a4a028e1ebd3a1ceb225be238
```

### 1.2 The Three Fundamental Object Types

| Type | Purpose | Format / Structure |
|---|---|---|
| **Blob** | Raw file contents | Stores raw bytes (no file name, no metadata) |
| **Tree** | Directory snapshot | List of entries: `<mode> <type> <hash> <name>` |
| **Commit** | Point-in-time snapshot | Points to root `tree`, `parent` commit(s), author, timestamp, and message |

---

## 2. Supported Commands

| Command | What it does under the hood |
|---|---|
| `dotnet run -- init` | Creates `.minigit/` folder structure, `objects/`, `refs/heads/`, and sets `HEAD` to `ref: refs/heads/main`. |
| `dotnet run -- commit -m "<msg>"` | Recursively scans workspace into Blobs and Trees, creates a Commit object pointing to the root Tree and parent, and updates active branch ref. |
| `dotnet run -- checkout <branch\|hash>` | Restores working directory files from commit's root Tree, and updates `HEAD` (to a branch or detached HEAD). |
| `dotnet run -- log` | Follows `parent` pointers backward from `HEAD` and prints the commit history DAG. |
| `dotnet run -- cat-file -p <hash>` | Inspects the raw contents of any Blob, Tree, or Commit in the database. |
| `dotnet run -- status` | Shows active branch and latest commit info. |
| `dotnet run -- branch [<name>]` | Lists branches or creates a new branch pointing to current `HEAD`. |
| `dotnet run -- demo` | Runs an automated end-to-end walkthrough demonstrating all commands. |

---

## 3. Quick Walkthrough

```bash
# 1. Run the built-in educational walkthrough
dotnet run -- demo

# 2. Or try manual commands:
dotnet run -- init
echo "Hello World" > hello.txt
dotnet run -- commit -m "First commit"

echo "Second line" >> hello.txt
dotnet run -- commit -m "Second commit"

# View DAG history
dotnet run -- log

# Inspect root commit / tree
dotnet run -- cat-file -p <commit_or_tree_hash>

# Checkout previous commit (detached HEAD)
dotnet run -- checkout <commit_hash>

# Checkout back to main branch
dotnet run -- checkout main
```
