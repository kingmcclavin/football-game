/* On-field play engine: one offensive snap, simulated frame by frame.
 * Pure game logic (no hardware access): positions are in yards Q12. */
#ifndef PLAY_H
#define PLAY_H

#include "types.h"
#include "playbook.h"

#define FP 12
#define YDS(n) ((s32)((n) * 4096))
#define FIELD_W 218453 /* 53.33 yards */

enum {
    A_QB, A_RB, A_WR1, A_WR2, A_TE, A_OL1, A_OL2, A_OL3, A_OL4,
    A_DL1, A_DL2, A_DL3, A_LB1, A_LB2, A_CB1, A_CB2, A_S1, A_S2, NUM_ACTORS
};
#define NUM_OFF 9

typedef struct {
    u8 spd, agi, str, hands, skill, tackle, rush, arm, acc;
} Ratings;

enum {
    J_IDLE, J_QB, J_ROUTE, J_PASSBLOCK, J_RUNBLOCK, J_CARRIER, J_RUSH, J_MAN,
    J_ZONE, J_PURSUE, J_BALL, J_HANDOFF, J_BITE
};

typedef struct {
    s32 x, y, vx, vy;
    s32 wx[3], wy[3]; /* route waypoints */
    s32 ax, ay;       /* anchor / home */
    s16 maxSpd, accel;
    s16 timer;        /* job timer (shed, hold, reaction) */
    s16 cool;         /* tackle attempt / move cooldown */
    u8 side, job, wp, nwp, settle;
    s8 target;        /* man assignment / block target */
    s8 engaged;       /* actor engaged with (-1 none) */
    u8 stun;          /* knocked down frames */
    u8 down;          /* lying on the ground (play over) */
    u8 frame, flip;
    u8 anim;
    u8 react;         /* reaction delay */
    u8 receiver;      /* eligible pass catcher this play */
    Ratings r;
} Actor;

enum { FR_STAND, FR_RUN1, FR_RUN2, FR_THROW, FR_CATCH, FR_DOWN, FR_BLOCK, FR_DIVE };

enum { BALL_SNAP, BALL_HELD, BALL_AIR, BALL_PITCH, BALL_DEAD, BALL_AWAY };

typedef struct {
    s32 x, y, z;
    s32 sx, sy, tx, ty;
    s32 apex;
    s16 t, T;
    u8 state;
    s8 holder;
    s8 intended;
    u8 power;
} Ball;

enum {
    OUT_NONE, OUT_TACKLE, OUT_OOB, OUT_INCOMPLETE, OUT_TD, OUT_SAFETY,
    OUT_INT, OUT_INT_TD, OUT_FUMBLE, OUT_SACK, OUT_KNEEL
};

/* events raised during a frame (for sound / banners) */
#define PE_SNAP 0x0001
#define PE_THROW 0x0002
#define PE_CATCH 0x0004
#define PE_TACKLE 0x0008
#define PE_JUKE 0x0010
#define PE_INT 0x0020
#define PE_DROP 0x0040
#define PE_BROKEN_UP 0x0080
#define PE_DIVING 0x0100
#define PE_TD 0x0200
#define PE_SACK 0x0400
#define PE_FUMBLE 0x0800
#define PE_OOB 0x1000
#define PE_MISSED_TACKLE 0x2000
#define PE_INCOMPLETE 0x4000
#define PE_HANDOFF 0x8000
#define PE_BIGCATCH 0x10000
#define PE_STIFFARM 0x20000

enum { DS_MAN, DS_ZONE, DS_BLITZ };

typedef struct {
    s32 losX;       /* line of scrimmage (Q12 x) */
    s32 spotY;      /* ball spot across the field */
    s32 firstDownX; /* first down marker (Q12 x) */
    u8 playIdx;
    u8 iq;          /* defense intelligence 0-3 */
    u8 tackleBonus; /* difficulty modifier */
    u8 defCall;     /* forced scheme or 255 random */
    Ratings off[NUM_OFF];
    Ratings def[NUM_ACTORS - NUM_OFF];
} PlaySetup;

typedef struct {
    u8 type;
    u8 pass, complete, throwaway, diving;
    s8 receiver;    /* actor that caught the ball (or -1) */
    s8 carrier;     /* actor that had the ball at the end */
    s8 injured;     /* actor injured on the play, -1 none */
    s32 spotX, spotY;
    s32 intX;       /* where an interception happened */
    u16 frames;
} Outcome;

enum { PP_PRESNAP, PP_SNAP, PP_LIVE, PP_HANDOFF, PP_AIR, PP_RUN, PP_DEAD, PP_DONE };

typedef struct {
    Actor a[NUM_ACTORS];
    Ball ball;
    PlaySetup su;
    const PlayDef *play;
    u8 phase;
    u8 scheme;
    s8 carrier;       /* actor with the ball, -1 none */
    s8 user;          /* actor controlled by the player, -1 none */
    s8 sel;           /* selected receiver */
    u8 aiming;
    u8 power;
    s32 aimOffX, aimOffY;
    s32 aimTx, aimTy; /* current computed aim target */
    s16 aimT;
    u8 crossedLOS;
    u8 throwFrame;
    u8 juke, stiff, dive;
    s16 jukeCool, stiffCool;
    u16 frame;        /* frames since snap (simulated) */
    u16 realFrame;
    u16 deadTimer;
    u32 events;
    u8 ballSide;      /* team in possession: 0 offense, 1 defense (after INT) */
    u8 celebrate;
    Outcome out;
    s32 histX[NUM_OFF][16], histY[NUM_OFF][16];
    u8 histPos;
} PlayState;

void play_setup(PlayState *ps, const PlaySetup *su);
void play_snap(PlayState *ps);
/* Advance one frame with the given pad state. */
void play_update(PlayState *ps, u16 held, u16 pressed, u16 released);
int play_done(const PlayState *ps);
/* Receivers that can be selected (actor indices). */
int play_eligible(const PlayState *ps, s8 *out);
/* Is the receiver open (no defender within ~2.5 yd)? */
int play_open(const PlayState *ps, int idx);
/* Auto-play helper for tests and demo mode: picks inputs. */
void play_autopilot(PlayState *ps, u16 *held, u16 *pressed, u16 *released);

#endif
