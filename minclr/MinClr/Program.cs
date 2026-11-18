using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection.Metadata;
using System.Reflection.Metadata.Ecma335;
using System.Reflection.PortableExecutable;

namespace MinClr
{
    internal static class Program
    {
        public static int Main(string[] args)
        {
            if (args.Length == 0)
            {
                Console.Error.WriteLine("Usage: MinClr <path-to-assembly.dll> [--trace]");
                return 1;
            }

            string assemblyPath = args[0];
            bool trace = args.Length > 1 && args[1] == "--trace";

            using var stream = File.OpenRead(assemblyPath);
            using var peReader = new PEReader(stream);

            if (!peReader.HasMetadata)
            {
                Console.Error.WriteLine("Error: PE file has no CLI metadata.");
                return 1;
            }

            var mdReader = peReader.GetMetadataReader();
            int entryPointToken = peReader.PEHeaders.CorHeader!.EntryPointTokenOrRelativeVirtualAddress;
            if (entryPointToken == 0)
            {
                Console.Error.WriteLine("Error: Assembly has no entry point.");
                return 1;
            }

            var entryHandle = (MethodDefinitionHandle)MetadataTokens.EntityHandle(entryPointToken);
            var vm = new MiniClrVm(peReader, mdReader, trace);
            vm.ExecuteMethod(entryHandle, Array.Empty<object?>());
            return 0;
        }
    }

    internal sealed class GcObject
    {
        public int Id { get; }
        public string TypeName { get; }
        public object?[] Fields { get; }
        public bool Marked { get; set; }

        public GcObject(int id, string typeName, int fieldCount)
        {
            Id = id;
            TypeName = typeName;
            Fields = new object?[fieldCount];
        }

        public override string ToString() => $"{TypeName}#{Id}";
    }

    internal sealed class ManagedHeap
    {
        private readonly List<GcObject> _objects = new();
        private int _nextId = 1;
        private readonly int _threshold;
        private readonly bool _trace;

        public ManagedHeap(int threshold = 4, bool trace = false)
        {
            _threshold = threshold;
            _trace = trace;
        }

        public GcObject Allocate(string typeName, int fieldCount, Func<IEnumerable<object?>> getRoots)
        {
            if (_objects.Count >= _threshold)
            {
                Collect(getRoots());
            }

            var obj = new GcObject(_nextId++, typeName, fieldCount);
            _objects.Add(obj);
            if (_trace)
            {
                Console.WriteLine($"[HEAP] Alloc {obj} (fields={fieldCount}, live={_objects.Count})");
            }
            return obj;
        }

        public void Collect(IEnumerable<object?> roots)
        {
            int before = _objects.Count;

            // 1. Mark phase (DFS from all GC roots)
            var worklist = new Stack<GcObject>();
            foreach (object? root in roots)
            {
                if (root is GcObject obj && !obj.Marked)
                {
                    obj.Marked = true;
                    worklist.Push(obj);
                }
            }

            while (worklist.Count > 0)
            {
                GcObject current = worklist.Pop();
                foreach (object? field in current.Fields)
                {
                    if (field is GcObject child && !child.Marked)
                    {
                        child.Marked = true;
                        worklist.Push(child);
                    }
                }
            }

            // 2. Sweep phase (reclaim unmarked objects, reset marks on survivors)
            int freed = 0;
            for (int i = _objects.Count - 1; i >= 0; i--)
            {
                GcObject obj = _objects[i];
                if (!obj.Marked)
                {
                    if (_trace)
                    {
                        Console.WriteLine($"[GC]   Sweep {obj}");
                    }
                    _objects.RemoveAt(i);
                    freed++;
                }
                else
                {
                    obj.Marked = false;
                }
            }

            Console.WriteLine($"[GC] Collect: before={before}, freed={freed}, alive={_objects.Count}");
        }
    }

    internal sealed class MiniClrVm
    {
        private readonly PEReader _peReader;
        private readonly MetadataReader _md;
        private readonly bool _trace;
        private readonly ManagedHeap _heap;
        private readonly List<(object?[] Args, object?[] Locals, Stack<object?> Stack)> _frames = new();

        public MiniClrVm(PEReader peReader, MetadataReader md, bool trace)
        {
            _peReader = peReader;
            _md = md;
            _trace = trace;
            _heap = new ManagedHeap(threshold: 4, trace: trace);
        }

        private IEnumerable<object?> GetRoots()
        {
            foreach (var frame in _frames)
            {
                foreach (object? a in frame.Args) yield return a;
                foreach (object? l in frame.Locals) yield return l;
                foreach (object? s in frame.Stack) yield return s;
            }
        }

        public object? ExecuteMethod(MethodDefinitionHandle methodHandle, object?[] args)
        {
            MethodDefinition methodDef = _md.GetMethodDefinition(methodHandle);
            string methodName = _md.GetString(methodDef.Name);
            MethodBodyBlock body = _peReader.GetMethodBody(methodDef.RelativeVirtualAddress);

            int localCount = GetLocalCount(body.LocalSignature);
            object?[] locals = new object?[localCount];
            var stack = new Stack<object?>();
            byte[] il = body.GetILBytes() ?? Array.Empty<byte>();

            var frame = (args, locals, stack);
            _frames.Add(frame);
            try
            {
                return ExecuteLoop(methodDef, methodName, args, locals, stack, il);
            }
            finally
            {
                _frames.RemoveAt(_frames.Count - 1);
            }
        }

        private object? ExecuteLoop(
            MethodDefinition methodDef,
            string methodName,
            object?[] args,
            object?[] locals,
            Stack<object?> stack,
            byte[] il)
        {

            if (_trace)
            {
                Console.WriteLine($"[ENTER] {methodName} (args={args.Length}, locals={locals.Length}, ilBytes={il.Length})");
            }

            int ip = 0;
            while (ip < il.Length)
            {
                int offset = ip;
                byte op = il[ip++];

                if (_trace)
                {
                    Console.WriteLine($"  IL_{offset:X4}: 0x{op:X2}");
                }

                switch (op)
                {
                    case 0x00: // nop
                        break;

                    // ldarg.0 .. ldarg.3
                    case 0x02: stack.Push(args[0]); break;
                    case 0x03: stack.Push(args[1]); break;
                    case 0x04: stack.Push(args[2]); break;
                    case 0x05: stack.Push(args[3]); break;
                    case 0x0E: // ldarg.s
                        stack.Push(args[il[ip++]]);
                        break;

                    // ldloc.0 .. ldloc.3
                    case 0x06: stack.Push(locals[0]); break;
                    case 0x07: stack.Push(locals[1]); break;
                    case 0x08: stack.Push(locals[2]); break;
                    case 0x09: stack.Push(locals[3]); break;
                    case 0x11: // ldloc.s
                        stack.Push(locals[il[ip++]]);
                        break;

                    // stloc.0 .. stloc.3
                    case 0x0A: locals[0] = stack.Pop(); break;
                    case 0x0B: locals[1] = stack.Pop(); break;
                    case 0x0C: locals[2] = stack.Pop(); break;
                    case 0x0D: locals[3] = stack.Pop(); break;
                    case 0x13: // stloc.s
                        locals[il[ip++]] = stack.Pop();
                        break;

                    case 0x14: // ldnull
                        stack.Push(null);
                        break;

                    // ldc.i4.m1 .. ldc.i4.8
                    case 0x15: stack.Push(-1); break;
                    case 0x16: stack.Push(0); break;
                    case 0x17: stack.Push(1); break;
                    case 0x18: stack.Push(2); break;
                    case 0x19: stack.Push(3); break;
                    case 0x1A: stack.Push(4); break;
                    case 0x1B: stack.Push(5); break;
                    case 0x1C: stack.Push(6); break;
                    case 0x1D: stack.Push(7); break;
                    case 0x1E: stack.Push(8); break;
                    case 0x1F: // ldc.i4.s
                        stack.Push((int)(sbyte)il[ip++]);
                        break;
                    case 0x20: // ldc.i4
                        stack.Push(BitConverter.ToInt32(il, ip));
                        ip += 4;
                        break;

                    case 0x26: // pop
                        stack.Pop();
                        break;

                    case 0x28: // call
                    {
                        int token = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        HandleCall(token, stack);
                        break;
                    }

                    case 0x2A: // ret
                    {
                        bool hasReturn = HasReturnValue(methodDef.Signature);
                        object? retVal = hasReturn ? stack.Pop() : null;
                        if (_trace)
                        {
                            Console.WriteLine($"[EXIT]  {methodName} -> {(hasReturn ? retVal : "void")}");
                        }
                        return retVal;
                    }

                    // Short branches (sbyte)
                    case 0x2B: // br.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        ip += delta;
                        break;
                    }
                    case 0x2C: // brfalse.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        if (ToInt32(stack.Pop()) == 0) ip += delta;
                        break;
                    }
                    case 0x2D: // brtrue.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        if (ToInt32(stack.Pop()) != 0) ip += delta;
                        break;
                    }
                    case 0x2E: // beq.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        if (a == b) ip += delta;
                        break;
                    }
                    case 0x2F: // bge.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        if (a >= b) ip += delta;
                        break;
                    }
                    case 0x30: // bgt.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        if (a > b) ip += delta;
                        break;
                    }
                    case 0x31: // ble.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        if (a <= b) ip += delta;
                        break;
                    }
                    case 0x32: // blt.s
                    {
                        sbyte delta = (sbyte)il[ip++];
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        if (a < b) ip += delta;
                        break;
                    }

                    // Long branches (int32)
                    case 0x38: // br
                    {
                        int delta = BitConverter.ToInt32(il, ip);
                        ip += 4 + delta;
                        break;
                    }
                    case 0x39: // brfalse
                    {
                        int delta = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        if (ToInt32(stack.Pop()) == 0) ip += delta;
                        break;
                    }
                    case 0x3A: // brtrue
                    {
                        int delta = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        if (ToInt32(stack.Pop()) != 0) ip += delta;
                        break;
                    }

                    // Arithmetic
                    case 0x58: // add
                    {
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        stack.Push(a + b);
                        break;
                    }
                    case 0x59: // sub
                    {
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        stack.Push(a - b);
                        break;
                    }
                    case 0x5A: // mul
                    {
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        stack.Push(a * b);
                        break;
                    }
                    case 0x5B: // div
                    {
                        int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                        stack.Push(a / b);
                        break;
                    }

                    case 0x72: // ldstr
                    {
                        int token = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        var handle = MetadataTokens.UserStringHandle(token);
                        stack.Push(_md.GetUserString(handle));
                        break;
                    }

                    case 0x73: // newobj
                    {
                        int token = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        HandleNewObj(token, stack);
                        break;
                    }

                    case 0x7B: // ldfld
                    {
                        int token = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        int fieldIndex = ResolveFieldIndex(token);
                        var obj = (GcObject?)stack.Pop() ?? throw new NullReferenceException();
                        stack.Push(obj.Fields[fieldIndex]);
                        break;
                    }

                    case 0x7D: // stfld
                    {
                        int token = BitConverter.ToInt32(il, ip);
                        ip += 4;
                        int fieldIndex = ResolveFieldIndex(token);
                        object? val = stack.Pop();
                        var obj = (GcObject?)stack.Pop() ?? throw new NullReferenceException();
                        obj.Fields[fieldIndex] = val;
                        break;
                    }

                    case 0xFE: // Two-byte opcodes
                    {
                        byte op2 = il[ip++];
                        switch (op2)
                        {
                            case 0x01: // ceq
                            {
                                int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                                stack.Push(a == b ? 1 : 0);
                                break;
                            }
                            case 0x02: // cgt
                            {
                                int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                                stack.Push(a > b ? 1 : 0);
                                break;
                            }
                            case 0x04: // clt
                            {
                                int b = ToInt32(stack.Pop()), a = ToInt32(stack.Pop());
                                stack.Push(a < b ? 1 : 0);
                                break;
                            }
                            default:
                                throw new NotSupportedException($"Unsupported 0xFE opcode: 0xFE 0x{op2:X2} at IL_{offset:X4}");
                        }
                        break;
                    }

                    default:
                        throw new NotSupportedException($"Unsupported opcode: 0x{op:X2} at IL_{offset:X4}");
                }
            }

            throw new InvalidOperationException($"Method {methodName} fell off the end without ret.");
        }

        private void HandleCall(int token, Stack<object?> stack)
        {
            EntityHandle handle = MetadataTokens.EntityHandle(token);

            if (handle.Kind == HandleKind.MethodDefinition)
            {
                var targetHandle = (MethodDefinitionHandle)handle;
                MethodDefinition targetDef = _md.GetMethodDefinition(targetHandle);
                (int paramCount, bool hasReturn) = ParseMethodSignature(targetDef.Signature);

                object?[] callArgs = new object?[paramCount];
                for (int i = paramCount - 1; i >= 0; i--)
                {
                    callArgs[i] = stack.Pop();
                }

                object? result = ExecuteMethod(targetHandle, callArgs);
                if (hasReturn)
                {
                    stack.Push(result);
                }
            }
            else if (handle.Kind == HandleKind.MemberReference)
            {
                var memberRef = _md.GetMemberReference((MemberReferenceHandle)handle);
                string memberName = _md.GetString(memberRef.Name);
                string typeName = ResolveParentTypeName(memberRef.Parent);
                (int paramCount, _) = ParseMethodSignature(memberRef.Signature);

                object?[] callArgs = new object?[paramCount];
                for (int i = paramCount - 1; i >= 0; i--)
                {
                    callArgs[i] = stack.Pop();
                }

                if (typeName == "System.Console" && memberName == "WriteLine")
                {
                    if (paramCount == 0)
                        Console.WriteLine();
                    else
                        Console.WriteLine(callArgs[0]);
                }
                else if (typeName == "System.Threading.Thread" && memberName == "Sleep")
                {
                    System.Threading.Thread.Sleep(ToInt32(callArgs[0]));
                }
                else if (typeName == "System.Object" && memberName == ".ctor")
                {
                    // Base Object..ctor is a no-op in this minimal VM.
                }
                else if (typeName == "System.GC" && memberName == "Collect")
                {
                    _heap.Collect(GetRoots());
                }
                else
                {
                    throw new NotSupportedException($"Unsupported external call: {typeName}::{memberName}");
                }
            }
            else
            {
                throw new NotSupportedException($"Unsupported call target handle kind: {handle.Kind}");
            }
        }

        private void HandleNewObj(int token, Stack<object?> stack)
        {
            EntityHandle handle = MetadataTokens.EntityHandle(token);
            if (handle.Kind != HandleKind.MethodDefinition)
            {
                throw new NotSupportedException($"Unsupported newobj target: {handle.Kind}");
            }

            var ctorHandle = (MethodDefinitionHandle)handle;
            MethodDefinition ctorDef = _md.GetMethodDefinition(ctorHandle);
            TypeDefinition typeDef = _md.GetTypeDefinition(ctorDef.GetDeclaringType());
            string typeName = _md.GetString(typeDef.Name);
            int fieldCount = typeDef.GetFields().Count;

            (int paramCount, _) = ParseMethodSignature(ctorDef.Signature);
            object?[] ctorArgs = new object?[paramCount + 1];
            for (int i = paramCount; i >= 1; i--)
            {
                ctorArgs[i] = stack.Pop();
            }

            GcObject obj = _heap.Allocate(typeName, fieldCount, GetRoots);
            ctorArgs[0] = obj;

            ExecuteMethod(ctorHandle, ctorArgs);
            stack.Push(obj);
        }

        private int ResolveFieldIndex(int token)
        {
            var fieldHandle = (FieldDefinitionHandle)MetadataTokens.EntityHandle(token);
            FieldDefinition fieldDef = _md.GetFieldDefinition(fieldHandle);
            TypeDefinition typeDef = _md.GetTypeDefinition(fieldDef.GetDeclaringType());

            int index = 0;
            foreach (FieldDefinitionHandle f in typeDef.GetFields())
            {
                if (f == fieldHandle) return index;
                index++;
            }
            throw new InvalidOperationException("Field not found in declaring type.");
        }

        private string ResolveParentTypeName(EntityHandle parent)
        {
            if (parent.Kind == HandleKind.TypeReference)
            {
                var typeRef = _md.GetTypeReference((TypeReferenceHandle)parent);
                string ns = _md.GetString(typeRef.Namespace);
                string name = _md.GetString(typeRef.Name);
                return string.IsNullOrEmpty(ns) ? name : $"{ns}.{name}";
            }
            return parent.Kind.ToString();
        }

        private int GetLocalCount(StandaloneSignatureHandle localSigHandle)
        {
            if (localSigHandle.IsNil) return 0;
            StandaloneSignature sig = _md.GetStandaloneSignature(localSigHandle);
            BlobReader reader = _md.GetBlobReader(sig.Signature);
            byte callingConv = reader.ReadByte(); // 0x07 = LOCAL_SIG
            if (callingConv != 0x07) return 0;
            return reader.ReadCompressedInteger();
        }

        private (int ParamCount, bool HasReturn) ParseMethodSignature(BlobHandle sigHandle)
        {
            BlobReader reader = _md.GetBlobReader(sigHandle);
            byte header = reader.ReadByte();
            if ((header & 0x10) != 0) // GENERIC
            {
                reader.ReadCompressedInteger();
            }
            int paramCount = reader.ReadCompressedInteger();
            byte retType = reader.ReadByte();
            bool hasReturn = retType != 0x01; // 0x01 = ELEMENT_TYPE_VOID
            return (paramCount, hasReturn);
        }

        private bool HasReturnValue(BlobHandle sigHandle) => ParseMethodSignature(sigHandle).HasReturn;

        private static int ToInt32(object? value) => value switch
        {
            int i => i,
            bool b => b ? 1 : 0,
            null => 0,
            _ => Convert.ToInt32(value)
        };
    }
}
