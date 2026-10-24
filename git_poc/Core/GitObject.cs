using System.Text;

namespace MiniGit.Core;

/*
 * ============================================================================
 *                       GIT OBJECT FORMAT & STORAGE
 * ============================================================================
 *
 * In Git, all data (files, directory trees, commits) is stored in the Object
 * Database (.minigit/objects/) using Content-Addressable Storage.
 *
 * Every object consists of a Header followed by a Payload:
 *
 *  +--------------------------------------------------------------------------+
 *  | "<type> <content_byte_length>\0" |            <payload_bytes>            |
 *  +--------------------------------------------------------------------------+
 *  \__________________________________/ \_____________________________________/
 *                 Header                                Payload
 *
 *  Hash = SHA-1( Header + Payload ) -> 40-character hexadecimal string
 *
 *  ----------------------------------------------------------------------------
 *  The 3 Fundamental Local Git Object Types:
 *  ----------------------------------------------------------------------------
 *
 *  1. BLOB (Binary Large Object):
 *     Stores raw file content. Has NO file name and NO permissions.
 *     Only the content itself determines its SHA-1 hash!
 *
 *     [ Header: "blob 12\0" ] [ Payload: "Hello World\n" ]
 *
 *  2. TREE:
 *     Stores directory snapshots. Maps file/folder names to their object hashes.
 *
 *     +-----------------------------------------------------------------------+
 *     | mode    type  hash                                     name           |
 *     | 100644  blob  557db03de997c86a4a028e1ebd3a1ceb225be238 README.md      |
 *     | 040000  tree  a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 src            |
 *     +-----------------------------------------------------------------------+
 *
 *  3. COMMIT:
 *     Stores snapshot metadata: points to a root tree, zero or more parent
 *     commits, author/timestamp, and a commit message.
 *
 *     +-----------------------------------------------------------------------+
 *     | tree 8b273461234abcd0912384719284712039847123                         |
 *     | parent 3f2901a89c456810239481230491823049182304 (optional)            |
 *     | author User <user@local> 2026-10-23T16:00:00Z                         |
 *     | committer User <user@local> 2026-10-23T16:00:00Z                      |
 *     |                                                                       |
 *     | Initial commit                                                        |
 *     +-----------------------------------------------------------------------+
 * ============================================================================
 */

/// <summary>
/// Base class representing any Git object stored in the object database.
/// </summary>
public abstract class GitObject
{
    public abstract GitObjectType Type { get; }

    /// <summary>
    /// Gets the payload bytes of the object (without the "<type> <size>\0" header).
    /// </summary>
    public abstract byte[] GetPayload();

    /// <summary>
    /// Encodes the object into its full Git storage format:
    /// [type] [size]\0[payload]
    /// </summary>
    public byte[] Serialize()
    {
        byte[] payload = GetPayload();
        string header = $"{Type.ToString().ToLowerInvariant()} {payload.Length}\0";
        byte[] headerBytes = Encoding.UTF8.GetBytes(header);

        byte[] fullObject = new byte[headerBytes.Length + payload.Length];
        Buffer.BlockCopy(headerBytes, 0, fullObject, 0, headerBytes.Length);
        Buffer.BlockCopy(payload, 0, fullObject, headerBytes.Length, payload.Length);

        return fullObject;
    }

    /// <summary>
    /// Parses a raw stored object byte array into a specific GitObject subclass.
    /// </summary>
    public static GitObject Parse(byte[] rawData)
    {
        // 1. Locate the null byte '\0' separating header from payload
        int nullIndex = Array.IndexOf(rawData, (byte)0);
        if (nullIndex == -1)
        {
            throw new InvalidDataException("Corrupted object: missing null terminator in header.");
        }

        string header = Encoding.UTF8.GetString(rawData, 0, nullIndex);
        string[] headerParts = header.Split(' ');
        if (headerParts.Length != 2)
        {
            throw new InvalidDataException($"Invalid object header format: '{header}'.");
        }

        string typeString = headerParts[0];
        int size = int.Parse(headerParts[1]);

        int payloadOffset = nullIndex + 1;
        int payloadLength = rawData.Length - payloadOffset;

        if (size != payloadLength)
        {
            throw new InvalidDataException($"Object size mismatch: header says {size}, actual is {payloadLength}.");
        }

        byte[] payload = new byte[payloadLength];
        Buffer.BlockCopy(rawData, payloadOffset, payload, 0, payloadLength);

        return typeString switch
        {
            "blob" => BlobObject.Deserialize(payload),
            "tree" => TreeObject.Deserialize(payload),
            "commit" => CommitObject.Deserialize(payload),
            _ => throw new NotSupportedException($"Unknown Git object type: '{typeString}'")
        };
    }
}

/// <summary>
/// A Blob object stores the raw contents of a single file.
/// It does NOT store the filename or file permissions.
/// </summary>
public sealed class BlobObject : GitObject
{
    public override GitObjectType Type => GitObjectType.Blob;
    public byte[] Content { get; }

    public BlobObject(byte[] content)
    {
        Content = content;
    }

    public BlobObject(string textContent)
    {
        Content = Encoding.UTF8.GetBytes(textContent);
    }

    public override byte[] GetPayload() => Content;

    public static BlobObject Deserialize(byte[] payload) => new(payload);
}

/// <summary>
/// Represents a single item inside a directory (Tree), either a file (blob) or a subdirectory (tree).
/// </summary>
public record TreeEntry(string Mode, GitObjectType Type, string Hash, string Name);

/// <summary>
/// A Tree object stores directory listings, connecting names to their hashes.
/// </summary>
public sealed class TreeObject : GitObject
{
    public override GitObjectType Type => GitObjectType.Tree;

    public List<TreeEntry> Entries { get; } = new();

    public TreeObject() { }

    public TreeObject(IEnumerable<TreeEntry> entries)
    {
        Entries.AddRange(entries);
    }

    public override byte[] GetPayload()
    {
        // Format each entry as: "<mode> <type> <hash> <name>\n"
        // Sorted alphabetically by Name (just like Git sorts directory entries)
        var sorted = Entries.OrderBy(e => e.Name, StringComparer.Ordinal);
        var sb = new StringBuilder();

        foreach (var entry in sorted)
        {
            sb.Append($"{entry.Mode} {entry.Type.ToString().ToLowerInvariant()} {entry.Hash} {entry.Name}\n");
        }

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static TreeObject Deserialize(byte[] payload)
    {
        var tree = new TreeObject();
        string text = Encoding.UTF8.GetString(payload);
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        foreach (var line in lines)
        {
            var parts = line.Split(' ', 4);
            if (parts.Length < 4) continue;

            string mode = parts[0];
            string typeStr = parts[1];
            string hash = parts[2];
            string name = parts[3];

            var type = typeStr == "tree" ? GitObjectType.Tree : GitObjectType.Blob;
            tree.Entries.Add(new TreeEntry(mode, type, hash, name));
        }

        return tree;
    }
}

/// <summary>
/// A Commit object captures a repository snapshot at a specific point in time.
/// </summary>
public sealed class CommitObject : GitObject
{
    public override GitObjectType Type => GitObjectType.Commit;

    public string TreeHash { get; set; } = string.Empty;
    public string? ParentHash { get; set; }
    public string Author { get; set; } = string.Empty;
    public string Committer { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;

    public override byte[] GetPayload()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"tree {TreeHash}");

        if (!string.IsNullOrWhiteSpace(ParentHash))
        {
            sb.AppendLine($"parent {ParentHash}");
        }

        sb.AppendLine($"author {Author}");
        sb.AppendLine($"committer {Committer}");
        sb.AppendLine();
        sb.Append(Message.TrimEnd());
        sb.Append('\n');

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static CommitObject Deserialize(byte[] payload)
    {
        var commit = new CommitObject();
        string text = Encoding.UTF8.GetString(payload);

        using var reader = new StringReader(text);
        string? line;

        // 1. Read key-value header lines up to the empty line separator
        while (!string.IsNullOrEmpty(line = reader.ReadLine()))
        {
            if (line.StartsWith("tree "))
            {
                commit.TreeHash = line["tree ".Length..].Trim();
            }
            else if (line.StartsWith("parent "))
            {
                commit.ParentHash = line["parent ".Length..].Trim();
            }
            else if (line.StartsWith("author "))
            {
                commit.Author = line["author ".Length..].Trim();
            }
            else if (line.StartsWith("committer "))
            {
                commit.Committer = line["committer ".Length..].Trim();
            }
        }

        // 2. Everything after the empty line is the commit message
        commit.Message = reader.ReadToEnd().Trim();

        return commit;
    }
}
