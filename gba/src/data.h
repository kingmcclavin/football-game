/* Static game data: teams, positions, names. */
#ifndef DATA_H
#define DATA_H

#include "types.h"

#define NUM_TEAMS 16
#define TEAMS_PER_CONF 8

typedef struct {
    const char *city;
    const char *name;
    const char *abbr;
    u8 r1, g1, b1; /* primary (0-31 each) */
    u8 r2, g2, b2; /* secondary */
    u8 helmetSecondary;  /* helmet uses secondary colour */
    u8 pantsPrimary;     /* pants use primary colour */
} TeamInfo;

extern const TeamInfo team_info[NUM_TEAMS];
extern const char *const conf_names[2];

enum {
    POS_QB, POS_RB, POS_WR, POS_TE, POS_OL, POS_DL, POS_LB, POS_DB, POS_K, NUM_POS
};

typedef struct {
    const char *abbr;
    const char *name;
    const char *attr[4];
    u8 weight[4];   /* overall weights, sum 16 */
    u8 salaryPct;   /* salary multiplier in percent */
    u8 rosterGen;   /* players generated per team */
    u8 starters;    /* starting slots */
} PosInfo;

extern const PosInfo pos_info[NUM_POS];

#define NUM_FIRST_NAMES 96
#define NUM_LAST_NAMES 160
extern const char *const first_names[NUM_FIRST_NAMES];
extern const char *const last_names[NUM_LAST_NAMES];

#define CHAMPIONSHIP_NAME "GOLD HELMET"
#define GAME_TITLE "PIXEL PIGSKIN"

#endif
