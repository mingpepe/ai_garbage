using System.Security.Cryptography;

namespace MiniGit.Core;

/*
 * ============================================================================
 *                    CONTENT-ADDRESSABLE OBJECT STORE
 * ============================================================================
 *
 * In Git, files are not saved by their names, but by the SHA-1 hash of their
 * contents (plus header). This makes Git a "Content-Addressable" store.
 *
 * Two identical files anywhere in the repository will produce the exact same
 * SHA-1 hash and will only be stored once on disk!
 *
 * Directory Partitioning:
 * To avoid placing thousands of files in a single directory (which hurts OS
 * filesystem performance), Git partitions the 40-character hex hash:
 *
 *   Hash: "557db03de997c86a4a028e1ebd3a1ceb225be238"
 *           ^^ \____________________________________/
 *           |                   |
 *     First 2 chars        Remaining 38 chars
 *      (Directory)             (Filename)
 *           |                   |
 *           v                   v
 *   .minigit/objects/55/7db03de997c86a4a028e1ebd3a1ceb225be238
 *
 * Write Pipeline:
 *  +------------+     +-------------------+     +------------------+
 *  | File/Data  | --> | [Header + Content]| --> | SHA-1 Calculation|
 *  +------------+     +-------------------+     +--------+---------+
 *                                                        |
 *                                                        v
 *                                           Write to .minigit/objects/xx/yyyy...
 * ============================================================================
 */

/// <summary>
/// Manages the low-level object database inside .minigit/objects.
/// </summary>
public sealed class ObjectStore
{
    private readonly string _objectsDir;

    public ObjectStore(string gitDir)
    {
        _objectsDir = Path.Combine(gitDir, "objects");
        Directory.CreateDirectory(_objectsDir);
    }

    /// <summary>
    /// Computes the SHA-1 hash of data and saves it into the object database.
    /// Returns the 40-character lowercase hex hash string.
    /// </summary>
    public string WriteObject(GitObject obj)
    {
        byte[] rawBytes = obj.Serialize();
        string hash = ComputeSha1(rawBytes);

        string dirPath = Path.Combine(_objectsDir, hash[..2]);
        string filePath = Path.Combine(dirPath, hash[2..]);

        if (!File.Exists(filePath))
        {
            Directory.CreateDirectory(dirPath);
            File.WriteAllBytes(filePath, rawBytes);
        }

        return hash;
    }

    /// <summary>
    /// Reads and parses an object given its 40-char hash or a unique short prefix (e.g. "a1b2c").
    /// </summary>
    public GitObject ReadObject(string hashOrPrefix)
    {
        var (_, rawBytes) = ReadRawObject(hashOrPrefix);
        return GitObject.Parse(rawBytes);
    }

    /// <summary>
    /// Reads the raw serialized byte array of an object given a full hash or prefix.
    /// </summary>
    public (string FullHash, byte[] RawBytes) ReadRawObject(string hashOrPrefix)
    {
        string fullHash = ResolveHash(hashOrPrefix);
        string filePath = GetObjectFilePath(fullHash);

        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Git object not found: '{fullHash}'");
        }

        return (fullHash, File.ReadAllBytes(filePath));
    }

    /// <summary>
    /// Resolves a short commit/object hash prefix (e.g. "557db03") into its full 40-character hash.
    /// </summary>
    public string ResolveHash(string hashOrPrefix)
    {
        if (string.IsNullOrWhiteSpace(hashOrPrefix))
        {
            throw new ArgumentException("Hash cannot be empty.", nameof(hashOrPrefix));
        }

        hashOrPrefix = hashOrPrefix.Trim().ToLowerInvariant();

        if (hashOrPrefix.Length == 40)
        {
            return hashOrPrefix;
        }

        if (hashOrPrefix.Length < 4)
        {
            throw new ArgumentException("Hash prefix must be at least 4 characters long.");
        }

        string prefixDir = hashOrPrefix[..2];
        string restPrefix = hashOrPrefix[2..];
        string searchDir = Path.Combine(_objectsDir, prefixDir);

        if (!Directory.Exists(searchDir))
        {
            throw new FileNotFoundException($"No object found starting with prefix: {hashOrPrefix}");
        }

        var matches = Directory.GetFiles(searchDir, restPrefix + "*")
                               .Select(Path.GetFileName)
                               .Where(fn => fn != null)
                               .ToList();

        if (matches.Count == 0)
        {
            throw new FileNotFoundException($"No object found starting with prefix: {hashOrPrefix}");
        }

        if (matches.Count > 1)
        {
            throw new InvalidOperationException($"Ambiguous hash prefix '{hashOrPrefix}'. Matches multiple objects.");
        }

        return prefixDir + matches[0];
    }

    private string GetObjectFilePath(string hash)
    {
        return Path.Combine(_objectsDir, hash[..2], hash[2..]);
    }

    private static string ComputeSha1(byte[] data)
    {
        byte[] hash = SHA1.HashData(data);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
