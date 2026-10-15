#ifndef SCREENS_H
#define SCREENS_H

/* Title screen; returns when the player starts something. */
void screen_title(void);
/* The career hub loop (never returns until the user exits to title). */
void screen_career(void);
/* Single exhibition game. */
void screen_quick_game(void);
/* New career setup. Returns 1 if a career was created. */
int screen_new_career(void);

#endif
