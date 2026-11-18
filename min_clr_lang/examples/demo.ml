// MinLang demo: Fibonacci, loops, strings, and boolean logic

fn fib(n: int) -> int {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

fn is_even(n: int) -> bool {
    return (n % 2) == 0;
}

fn main() -> int {
    let greeting = "Hello from MinLang on CLR!";
    print(greeting);

    let i: int = 0;
    while (i < 8) {
        let f = fib(i);
        print(f);
        i = i + 1;
    }

    let ok = is_even(10) && !is_even(7);
    print(ok);

    if ("clr" == "clr" && (true || false)) {
        print("String & logic check passed!");
    } else {
        print("Failed");
    }

    return 0;
}
