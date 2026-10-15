/* UI helpers: frame pump, menus, dialogs, headers, team crests. */
#ifndef UI_H
#define UI_H

#include "types.h"

/* one frame: poll input, update sound, wait for vblank */
void ui_frame(void);
/* clear text/panels/sprites and draw a menu backdrop */
void ui_screen(int backdropStyle);
void ui_title(const char *title, const char *right);
void ui_hint(const char *hint);
/* Blocking vertical menu inside a box. Returns index, or -1 on B.
 * disabledMask: bit i set = item i greyed out (can't select). */
int ui_menu(int x, int y, int w, const char *const *items, int n, int sel, u32 disabledMask);
/* ui_menu returns -2 after `frames` idle frames (0 = never). */
void ui_set_menu_timeout(int frames);
/* Grid menu (columns of rows). Returns index or -1 on B. */
int ui_grid_menu(int x, int y, int cols, int colw, const char *const *items, int n, int sel);
/* Show a message box; waits for A or B. */
void ui_message(const char *title, const char *body);
/* Yes/No dialog; returns 1 for yes. Default is NO. */
int ui_confirm(const char *question);
void ui_wait_button(void);
/* draw a team crest sprite (16x16) using OBJ palette bank `bank` */
void ui_crest(int x, int y, int team, int bank);
void ui_stars(char *out, int n, int max);
/* simple letter-grid text entry; returns length */
int ui_text_entry(const char *title, char *buf, int maxLen);
/* draw a word-wrapped paragraph; returns rows used */
int ui_paragraph(int x, int y, int w, const char *s, int pal);

#endif
