/* Offensive playbook: formations, routes and play calls. */
#ifndef PLAYBOOK_H
#define PLAYBOOK_H

#include "types.h"

enum {
    RT_NONE, RT_GO, RT_SLANT, RT_OUT, RT_IN, RT_POST, RT_CORNER, RT_CURL,
    RT_HITCH, RT_FLAT, RT_DRAG, RT_SEAM, RT_SCREEN, RT_WHEEL, RT_BLOCK,
    RT_CHECK, NUM_ROUTES
};

enum {
    PK_PASS, PK_RUN_IN, PK_RUN_OUT, PK_PLAY_ACTION, PK_SCREEN, PK_SNEAK,
    PK_KNEEL, PK_PUNT, PK_FG
};

typedef struct {
    const char *name;
    const char *desc;
    u8 kind;
    u8 route[4]; /* WR1, WR2, TE, RB */
} PlayDef;

#define NUM_PLAYS 12
extern const PlayDef playbook[NUM_PLAYS];

typedef struct {
    s8 dx, dy;  /* yards*2, dy positive = toward the middle of the field */
} RoutePt;

typedef struct {
    u8 n;
    u8 settle; /* stop at the last point (curl/hitch) */
    RoutePt pt[3];
} RouteDef;

extern const RouteDef routes[NUM_ROUTES];

#endif
