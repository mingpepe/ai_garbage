using System;
using System.Threading;

namespace TargetApp
{
    public sealed class Node
    {
        public int Value;
        public Node? Next;

        public Node(int value)
        {
            Value = value;
        }
    }

    public static class Program
    {
        public static void Main()
        {
            int a = 10;
            int b = 32;
            int sum = Add(a, b);
            Console.WriteLine(sum);

            Console.WriteLine("Sleeping...");
            Thread.Sleep(200);

            int fact = Factorial(5);
            Console.WriteLine(fact);

            Node head = new Node(100);
            head.Next = new Node(200);

            // Temporary unreachable objects
            Node temp1 = new Node(999);
            Node temp2 = new Node(888);
            temp1 = null!;
            temp2 = null!;

            // Triggers automatic GC on 5th allocation (threshold=4) or explicit GC.Collect()
            Node tail = new Node(300);
            head.Next.Next = tail;
            GC.Collect();

            Console.WriteLine(head.Value);
            Console.WriteLine(head.Next.Value);
            Console.WriteLine(head.Next.Next.Value);
        }

        private static int Add(int x, int y)
        {
            return x + y;
        }

        private static int Factorial(int n)
        {
            int result = 1;
            for (int i = 2; i <= n; i++)
            {
                result = result * i;
            }
            return result;
        }
    }
}
