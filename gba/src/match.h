/* A full game: the user plays offense; opponent drives are simulated
 * with the user's defensive call. */
#ifndef MATCH_H
#define MATCH_H

#include "types.h"

#define MF_EXHIBITION 1
#define MF_PLAYOFF 2
#define MF_DEMO 4 /* attract mode: the CPU plays; any key quits */

typedef struct {
    int userScore, oppScore;
    u16 passAtt, passComp, passYds, rushAtt, rushYds, oppYds;
    u8 passTD, rushTD, ints, fumbles, sacks, fgm, fga, firstDowns;
    s16 mvp;        /* player index of the game's star, -1 none */
    u8 simulated;
} MatchResult;

/* Plays a game between home and away; `user` is the user's team.
 * Blocking. Returns when the game is over. */
void match_play(int home, int away, int user, int flags, MatchResult *res);

/* How-to-play pages (also used from the title screen). */
void show_controls(void);

#endif
