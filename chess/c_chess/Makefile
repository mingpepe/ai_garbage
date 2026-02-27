CC = gcc
CFLAGS = -Wall -Wextra -std=c11
GTK_FLAGS = `pkg-config --cflags --libs gtk+-3.0`

# Target names
GAME_TARGET = chess_app
TEST_TARGET = test_app

# Source files
COMMON_SRC = logic.c
GAME_SRC = main.c
TEST_SRC = test.c

.PHONY: all test clean

all: $(GAME_TARGET) $(TEST_TARGET)

# Build the main game with GTK3
$(GAME_TARGET): $(GAME_SRC) $(COMMON_SRC)
	$(CC) $(CFLAGS) $(GAME_SRC) $(COMMON_SRC) -o $(GAME_TARGET) $(GTK_FLAGS)

# Build the unit test application
$(TEST_TARGET): $(TEST_SRC) $(COMMON_SRC)
	$(CC) $(CFLAGS) $(TEST_SRC) $(COMMON_SRC) -o $(TEST_TARGET)

# Run unit tests
test: $(TEST_TARGET)
	./$(TEST_TARGET)

# Clean build artifacts
clean:
	rm -f $(GAME_TARGET) $(TEST_TARGET)
