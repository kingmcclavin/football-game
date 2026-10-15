#include "ui.h"
#include "gfx.h"
#include "gba.h"
#include "input.h"
#include "sound.h"
#include "util.h"
#include "data.h"

void ui_frame(void)
{
    snd_update();
    gfx_vsync();
    input_poll();
}

void ui_screen(int backdropStyle)
{
    gfx_set_mode_menu();
    txt_clear();
    pnl_clear();
    big_text_clear();
    bg_menu_backdrop(backdropStyle);
    oam_begin();
}

void ui_title(const char *title, const char *right)
{
    pnl_fill(0, 0, 30, 2, T_BLACK);
    pnl_fill(0, 2, 30, 1, T_TEAM1);
    txt_print(1, 0, title, PAL_YELLOW);
    if (right)
        txt_right(28, 0, right, PAL_WHITE);
}

void ui_hint(const char *hint)
{
    pnl_fill(0, 19, 30, 1, T_BLACK);
    txt_clear_rect(0, 19, 30, 1);
    txt_print(1, 19, hint, PAL_GRAY);
}

static void draw_menu_items(int x, int y, int w, const char *const *items, int n, int sel, u32 dis)
{
    for (int i = 0; i < n; i++) {
        txt_clear_rect(x + 1, y + 1 + i, w - 2, 1);
        pnl_fill(x + 1, y + 1 + i, w - 2, 1, i == sel ? T_HILITE : T_FILL);
        int pal = (dis >> i) & 1 ? PAL_GRAY : (i == sel ? PAL_YELLOW : PAL_WHITE);
        if (i == sel)
            txt_put(x + 1, y + 1 + i, '`', PAL_YELLOW);
        txt_print(x + 2, y + 1 + i, items[i], pal);
    }
}

static int s_menuTimeout;

void ui_set_menu_timeout(int frames)
{
    s_menuTimeout = frames;
}

int ui_menu(int x, int y, int w, const char *const *items, int n, int sel, u32 dis)
{
    int idle = 0;
    pnl_box(x, y, w, n + 2);
    if (sel < 0 || sel >= n)
        sel = 0;
    while ((dis >> sel) & 1 && sel < n - 1)
        sel++;
    draw_menu_items(x, y, w, items, n, sel, dis);
    for (;;) {
        ui_frame();
        idle = (key_held & KEY_MASK) ? 0 : idle + 1;
        if (s_menuTimeout && idle > s_menuTimeout)
            return -2;
        int old = sel;
        if (key_repeat & KEY_DOWN) {
            do {
                sel = (sel + 1) % n;
            } while ((dis >> sel) & 1 && sel != old);
        }
        if (key_repeat & KEY_UP) {
            do {
                sel = (sel + n - 1) % n;
            } while ((dis >> sel) & 1 && sel != old);
        }
        if (sel != old) {
            snd_play(SFX_MOVE);
            draw_menu_items(x, y, w, items, n, sel, dis);
        }
        if (key_pressed & KEY_A) {
            if ((dis >> sel) & 1) {
                snd_play(SFX_ERROR);
                continue;
            }
            snd_play(SFX_OK);
            return sel;
        }
        if (key_pressed & KEY_B) {
            snd_play(SFX_BACK);
            return -1;
        }
    }
}

void ui_wait_button(void)
{
    for (int i = 0; i < 6; i++)
        ui_frame();
    for (;;) {
        ui_frame();
        if (key_pressed & (KEY_A | KEY_B | KEY_START)) {
            snd_play(SFX_OK);
            return;
        }
    }
}

int ui_paragraph(int x, int y, int w, const char *s, int pal)
{
    int row = 0, col = 0;
    while (*s) {
        if (*s == '\n') {
            row++;
            col = 0;
            s++;
            continue;
        }
        if (*s == ' ' && col == 0) {
            s++;
            continue;
        }
        /* measure the next word */
        int wl = 0;
        while (s[wl] && s[wl] != ' ' && s[wl] != '\n')
            wl++;
        if (col + wl > w && col > 0) {
            row++;
            col = 0;
            continue;
        }
        for (int i = 0; i < wl; i++)
            txt_put(x + col++, y + row, (u8)s[i], pal);
        s += wl;
        if (*s == ' ') {
            if (col < w)
                col++;
            s++;
        }
    }
    return row + 1;
}

void ui_message(const char *title, const char *body)
{
    /* count rows needed */
    int rows = 0, col = 0;
    for (const char *p = body; *p; p++) {
        if (*p == '\n' || col >= 23) {
            rows++;
            col = 0;
        } else {
            col++;
        }
    }
    rows += 2;
    if (rows > 12)
        rows = 12;
    int h = rows + 4;
    int y = (20 - h) / 2;
    pnl_box(2, y, 26, h);
    txt_clear_rect(3, y + 1, 24, h - 2);
    txt_print(4, y + 1, title, PAL_YELLOW);
    ui_paragraph(4, y + 3, 22, body, PAL_WHITE);
    ui_wait_button();
    txt_clear_rect(2, y, 26, h);
    pnl_fill(2, y, 26, h, T_EMPTY);
}

int ui_confirm(const char *question)
{
    pnl_box(3, 6, 24, 8);
    txt_clear_rect(4, 7, 22, 6);
    ui_paragraph(5, 7, 20, question, PAL_WHITE);
    static const char *const yn[2] = {"NO", "YES"};
    int r = ui_menu(10, 10, 10, yn, 2, 0, 0);
    txt_clear_rect(3, 6, 24, 8);
    pnl_fill(3, 6, 24, 8, T_EMPTY);
    return r == 1;
}

void ui_crest(int x, int y, int team, int bank)
{
    pal_team_obj(bank, team, 0, 0);
    oam_add(x, y, OT_CREST, SPR_16x16, bank, 0, 0);
}

void ui_stars(char *out, int n, int max)
{
    for (int i = 0; i < max; i++)
        out[i] = i < n ? '{' : '.';
    out[max] = 0;
}

int ui_text_entry(const char *title, char *buf, int maxLen)
{
    static const char grid[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ .-'";
    const int cols = 10, nchars = 30;
    int len = str_len(buf);
    int sel = 0;
    ui_screen(0);
    ui_title(title, 0);
    pnl_box(2, 4, 26, 3);
    pnl_box(2, 8, 26, 9);
    ui_hint("A:ADD B:DEL START:DONE");
    for (;;) {
        txt_clear_rect(3, 5, 24, 1);
        txt_print(4, 5, buf, PAL_WHITE);
        if (len < maxLen && (g_frame & 16))
            txt_put(4 + len, 5, '_', PAL_YELLOW);
        for (int i = 0; i < nchars + 2; i++) {
            int cx = 4 + (i % cols) * 2, cy = 9 + (i / cols) * 2;
            int pal = i == sel ? PAL_YELLOW : PAL_WHITE;
            pnl_put(cx, cy, i == sel ? T_HILITE : T_FILL, PAL_PANEL);
            if (i < nchars)
                txt_put(cx, cy, grid[i] == ' ' ? '_' : grid[i], pal);
        }
        txt_print(4, 15, "DEL", sel == nchars ? PAL_YELLOW : PAL_WHITE);
        txt_print(14, 15, "DONE", sel == nchars + 1 ? PAL_YELLOW : PAL_WHITE);
        ui_frame();
        int old = sel;
        if (key_repeat & KEY_RIGHT) sel = (sel + 1) % (nchars + 2);
        if (key_repeat & KEY_LEFT) sel = (sel + nchars + 1) % (nchars + 2);
        if (key_repeat & KEY_DOWN) sel = sel + cols <= nchars + 1 ? sel + cols : sel % cols;
        if (key_repeat & KEY_UP) sel = sel - cols >= 0 ? sel - cols : MIN(sel + 30, nchars + 1);
        if (sel != old)
            snd_play(SFX_MOVE);
        if (key_pressed & KEY_A) {
            if (sel < nchars && len < maxLen) {
                buf[len++] = grid[sel];
                buf[len] = 0;
                snd_play(SFX_MOVE);
            } else if (sel == nchars && len > 0) {
                buf[--len] = 0;
                snd_play(SFX_BACK);
            } else if (sel == nchars + 1) {
                snd_play(SFX_OK);
                break;
            }
        }
        if ((key_pressed & KEY_B) && len > 0) {
            buf[--len] = 0;
            snd_play(SFX_BACK);
        }
        if (key_pressed & KEY_START) {
            snd_play(SFX_OK);
            break;
        }
    }
    /* trim trailing spaces */
    while (len > 0 && buf[len - 1] == ' ')
        buf[--len] = 0;
    return len;
}

static void draw_grid(int x, int y, int cols, int colw, const char *const *items, int n, int sel)
{
    int rows = (n + cols - 1) / cols;
    for (int i = 0; i < cols * rows; i++) {
        int c = i / rows, r = i % rows;
        int cx = x + 1 + c * colw, cy = y + 1 + r;
        txt_clear_rect(cx, cy, colw, 1);
        pnl_fill(cx, cy, colw, 1, i == sel ? T_HILITE : T_FILL);
        if (i >= n)
            continue;
        if (i == sel)
            txt_put(cx, cy, '`', PAL_YELLOW);
        txt_print(cx + 1, cy, items[i], i == sel ? PAL_YELLOW : PAL_WHITE);
    }
}

int ui_grid_menu(int x, int y, int cols, int colw, const char *const *items, int n, int sel)
{
    int rows = (n + cols - 1) / cols;
    pnl_box(x, y, cols * colw + 2, rows + 2);
    if (sel < 0 || sel >= n)
        sel = 0;
    draw_grid(x, y, cols, colw, items, n, sel);
    for (;;) {
        ui_frame();
        int old = sel;
        int c = sel / rows, r = sel % rows;
        if (key_repeat & KEY_DOWN)
            r = (r + 1) % rows;
        if (key_repeat & KEY_UP)
            r = (r + rows - 1) % rows;
        if (key_repeat & KEY_RIGHT)
            c = (c + 1) % cols;
        if (key_repeat & KEY_LEFT)
            c = (c + cols - 1) % cols;
        int ns = c * rows + r;
        if (ns < n)
            sel = ns;
        if (sel != old) {
            snd_play(SFX_MOVE);
            draw_grid(x, y, cols, colw, items, n, sel);
        }
        if (key_pressed & KEY_A) {
            snd_play(SFX_OK);
            return sel;
        }
        if (key_pressed & KEY_B) {
            snd_play(SFX_BACK);
            return -1;
        }
    }
}
