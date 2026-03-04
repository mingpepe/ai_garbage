CC = gcc
CFLAGS = -Wall -O3
LDFLAGS = -lGL -lGLU -lglut -lm

TARGET = raytrace
SRC = main.c

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) $(SRC) -o $(TARGET) $(LDFLAGS)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)
