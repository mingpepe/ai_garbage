.assembly extern System.Runtime {}
.assembly extern System.Console {}
.assembly demo {}

.class public abstract auto ansi sealed beforefieldinit Program extends [System.Runtime]System.Object
{
  .method public hidebysig static int32 fib(int32 n) cil managed
  {
    ldarg.s 0 // n
    ldc.i4 1
    cgt
    ldc.i4.0
    ceq
    brfalse ENDIF_1
    ldarg.s 0 // n
    ret
  ENDIF_1:
    ldarg.s 0 // n
    ldc.i4 1
    sub
    call int32 Program::fib(int32)
    ldarg.s 0 // n
    ldc.i4 2
    sub
    call int32 Program::fib(int32)
    add
    ret
    ldc.i4.0
    ret
  }

  .method public hidebysig static bool is_even(int32 n) cil managed
  {
    ldarg.s 0 // n
    ldc.i4 2
    rem
    ldc.i4 0
    ceq
    ret
    ldc.i4.0
    ret
  }

  .method public hidebysig static int32 Main() cil managed
  {
    .entrypoint
    ldstr "Hello from MinLang on CLR!"
    stloc.0 // greeting
    ldloc.0 // greeting
    call void [System.Console]System.Console::WriteLine(string)
    ldc.i4 0
    stloc.1 // i
  WHILE_COND_0:
    ldloc.1 // i
    ldc.i4 8
    clt
    brfalse WHILE_END_1
    ldloc.1 // i
    call int32 Program::fib(int32)
    stloc.2 // f
    ldloc.2 // f
    call void [System.Console]System.Console::WriteLine(int32)
    ldloc.1 // i
    ldc.i4 1
    add
    stloc.1 // i
    br WHILE_COND_0
  WHILE_END_1:
    ldc.i4 10
    call bool Program::is_even(int32)
    brfalse AND_FALSE_2
    ldc.i4 7
    call bool Program::is_even(int32)
    ldc.i4.0
    ceq
    br AND_END_3
  AND_FALSE_2:
    ldc.i4.0
  AND_END_3:
    stloc.3 // ok
    ldloc.3 // ok
    call void [System.Console]System.Console::WriteLine(bool)
    ldstr "clr"
    ldstr "clr"
    call bool [System.Runtime]System.String::op_Equality(string, string)
    brfalse AND_FALSE_6
    ldc.i4.1
    brtrue OR_TRUE_8
    ldc.i4.0
    br OR_END_9
  OR_TRUE_8:
    ldc.i4.1
  OR_END_9:
    br AND_END_7
  AND_FALSE_6:
    ldc.i4.0
  AND_END_7:
    brfalse ELSE_4
    ldstr "String & logic check passed!"
    call void [System.Console]System.Console::WriteLine(string)
    br ENDIF_5
  ELSE_4:
    ldstr "Failed"
    call void [System.Console]System.Console::WriteLine(string)
  ENDIF_5:
    ldc.i4 0
    ret
    ldc.i4.0
    ret
  }

}
