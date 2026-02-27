# -*- coding: utf-8 -*-
import tkinter as tk
from logic import Board, is_valid_move, get_computer_move

class ChessUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Python Chinese Chess (AI)")
        self.board = Board()
        self.selected = None
        self.last_move = None # (fr, fc, tr, tc)
        
        self.status_label = tk.Label(root, text="Red Turn", font=("Arial", 14, "bold"), fg="#d32f2f")
        self.status_label.pack(pady=5)
        
        self.canvas = tk.Canvas(root, width=450, height=500, bg="#e3bc8a")
        self.canvas.pack(pady=10)
        self.canvas.bind("<Button-1>", self.on_click)
        
        self.restart_btn = tk.Button(root, text="Restart", command=self.restart)
        self.restart_btn.pack(pady=5)
        
        self.draw_board()

    def restart(self):
        self.board = Board()
        self.selected = None
        self.last_move = None
        self.status_label.config(text="Red Turn", fg="#d32f2f")
        self.draw_board()

    def draw_board(self):
        self.canvas.delete("all")
        # Grid lines
        for i in range(10): self.canvas.create_line(25, 25+i*50, 425, 25+i*50)
        for i in range(9): self.canvas.create_line(25+i*50, 25, 25+i*50, 475)
        
        # Last move highlight
        if self.last_move:
            fr, fc, tr, tc = self.last_move
            self.canvas.create_rectangle(25+fc*50-23, 25+fr*50-23, 25+fc*50+23, 25+fr*50+23, outline="blue", width=2)
            self.canvas.create_rectangle(25+tc*50-23, 25+tr*50-23, 25+tc*50+23, 25+tr*50+23, outline="orange", width=2)

        # Pieces
        for r in range(10):
            for c in range(9):
                p = self.board.state[r][c]
                if p:
                    color = "#d32f2f" if p['player'] == 'red' else "#1a1a1a"
                    bg = "#fcebc4"
                    if self.selected == (r, c): bg = "#1976d2"
                    x, y = 25+c*50, 25+r*50
                    self.canvas.create_oval(x-21, y-21, x+21, y+21, fill=bg, outline=color, width=2)
                    self.canvas.create_text(x, y, text=p['char'], fill=color, font=("Arial", 16, "bold"))

    def move_piece(self, fr, fc, tr, tc):
        target = self.board.state[tr][tc]
        if target and target['type'] == 'GENERAL':
            self.board.game_over = True
            winner = "Red Wins!" if self.board.current_player == 'red' else "Computer Wins!"
            self.status_label.config(text=winner, fg="#ff9800")

        self.board.state[tr][tc] = self.board.state[fr][fc]
        self.board.state[fr][fc] = None
        self.last_move = (fr, fc, tr, tc)
        self.selected = None
        
        if not self.board.game_over:
            self.board.current_player = 'black' if self.board.current_player == 'red' else 'red'
            turn_text = "Red Turn" if self.board.current_player == 'red' else "Thinking..."
            color = "#d32f2f" if self.board.current_player == 'red' else "#555"
            self.status_label.config(text=turn_text, fg=color)
            
            if self.board.current_player == 'black':
                self.root.after(800, self.make_ai_move)

        self.draw_board()

    def make_ai_move(self):
        move = get_computer_move(self.board)
        if move:
            self.move_piece(*move)
        else:
            self.board.game_over = True
            self.status_label.config(text="Red Wins! (Stalemate)", fg="#ff9800")

    def on_click(self, event):
        if self.board.game_over or self.board.current_player == 'black': return
        c = (event.x - 25 + 25) // 50
        r = (event.y - 25 + 25) // 50
        if 0 <= r < 10 and 0 <= c < 9:
            p = self.board.state[r][c]
            if self.selected:
                if is_valid_move(self.board, self.selected[0], self.selected[1], r, c):
                    self.move_piece(self.selected[0], self.selected[1], r, c)
                elif p and p['player'] == 'red':
                    self.selected = (r, c)
                    self.draw_board()
                else:
                    self.selected = None
                    self.draw_board()
            elif p and p['player'] == 'red':
                self.selected = (r, c)
                self.draw_board()

if __name__ == "__main__":
    root = tk.Tk()
    ui = ChessUI(root)
    root.mainloop()
