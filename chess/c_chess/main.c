#include <gtk/gtk.h>
#include "logic.h"

static Board board;
static int sel_r = -1, sel_c = -1;
static GtkWidget *btns[10][9], *lbl_status;

static void update_ui() {
    for (int r = 0; r < 10; r++) for (int c = 0; c < 9; c++) {
        GtkWidget *btn = btns[r][c];
        GtkStyleContext *ctx = gtk_widget_get_style_context(btn);
        gtk_style_context_remove_class(ctx, "selected");
        if (sel_r == r && sel_c == c) gtk_style_context_add_class(ctx, "selected");
        if (board.state[r][c].exists) {
            gtk_button_set_label(GTK_BUTTON(btn), board.state[r][c].piece_char);
            gtk_widget_set_name(btn, board.state[r][c].player == RED ? "red" : "black");
        } else {
            gtk_button_set_label(GTK_BUTTON(btn), "");
            gtk_widget_set_name(btn, "empty");
        }
    }
    if (board.game_over) gtk_label_set_text(GTK_LABEL(lbl_status), "Game Over!");
    else gtk_label_set_text(GTK_LABEL(lbl_status), board.current_player == RED ? "Red Turn" : "Thinking...");
}

static gboolean trigger_ai(gpointer data) {
    (void)data;
    if (board.current_player == BLACK && !board.game_over) {
        computer_move(&board);
        update_ui();
    }
    return FALSE;
}

static void on_click(GtkWidget *widget, gpointer data) {
    (void)widget;
    if (board.game_over || board.current_player == BLACK) return;
    int r = (int)(long)data / 9, c = (int)(long)data % 9;
    if (sel_r == -1) {
        if (board.state[r][c].exists && board.state[r][c].player == RED) { sel_r = r; sel_c = c; }
    } else {
        if (make_move(&board, sel_r, sel_c, r, c)) {
            sel_r = -1; sel_c = -1;
            update_ui();
            g_timeout_add(800, trigger_ai, NULL);
        } else if (board.state[r][c].exists && board.state[r][c].player == RED) {
            sel_r = r; sel_c = c;
        } else { sel_r = -1; sel_c = -1; }
    }
    update_ui();
}

int main(int argc, char *argv[]) {
    gtk_init(&argc, &argv);
    init_board(&board);
    GtkWidget *win = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(win), "C GTK Chinese Chess");
    GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 10);
    lbl_status = gtk_label_new("Red Turn");
    gtk_box_pack_start(GTK_BOX(box), lbl_status, FALSE, FALSE, 0);
    GtkWidget *grid = gtk_grid_new();
    gtk_box_pack_start(GTK_BOX(box), grid, TRUE, TRUE, 0);
    gtk_container_add(GTK_CONTAINER(win), box);

    GtkCssProvider *cp = gtk_css_provider_new();
    gtk_css_provider_load_from_data(cp, "#red { color: red; font-weight: bold; } #black { color: black; font-weight: bold; } .selected { background: #b3d4fc; }", -1, NULL);
    gtk_style_context_add_provider_for_screen(gdk_screen_get_default(), GTK_STYLE_PROVIDER(cp), GTK_STYLE_PROVIDER_PRIORITY_USER);

    for (int r = 0; r < 10; r++) for (int c = 0; c < 9; c++) {
        btns[r][c] = gtk_button_new();
        gtk_widget_set_size_request(btns[r][c], 50, 50);
        g_signal_connect(btns[r][c], "clicked", G_CALLBACK(on_click), (gpointer)(long)(r * 9 + c));
        gtk_grid_attach(GTK_GRID(grid), btns[r][c], c, r, 1, 1);
    }
    update_ui();
    g_signal_connect(win, "destroy", G_CALLBACK(gtk_main_quit), NULL);
    gtk_widget_show_all(win);
    gtk_main();
    return 0;
}
