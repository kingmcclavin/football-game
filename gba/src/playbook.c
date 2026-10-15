#include "playbook.h"

/* Route points are cumulative offsets from the receiver's starting spot,
 * in half-yards: dx downfield, dy toward the middle of the field. */
const RouteDef routes[NUM_ROUTES] = {
    [RT_NONE] = {0, 1, {{0, 0}}},
    [RT_GO] = {1, 0, {{120, 0}}},
    [RT_SLANT] = {2, 0, {{4, 0}, {28, 22}}},
    [RT_OUT] = {2, 0, {{12, 0}, {12, -40}}},
    [RT_IN] = {2, 0, {{18, 0}, {18, 50}}},
    [RT_POST] = {2, 0, {{22, 0}, {64, 26}}},
    [RT_CORNER] = {2, 0, {{20, 0}, {52, -24}}},
    [RT_CURL] = {2, 1, {{18, 0}, {14, 4}}},
    [RT_HITCH] = {2, 1, {{12, 0}, {10, 0}}},
    [RT_FLAT] = {2, 0, {{2, -10}, {8, -40}}},
    [RT_DRAG] = {2, 0, {{4, 0}, {10, 60}}},
    [RT_SEAM] = {1, 0, {{120, 0}}},
    [RT_SCREEN] = {2, 1, {{-3, -8}, {-4, -14}}},
    [RT_WHEEL] = {2, 0, {{2, -16}, {60, -22}}},
    [RT_BLOCK] = {0, 1, {{0, 0}}},
    [RT_CHECK] = {2, 0, {{2, -10}, {8, -30}}},
};

const PlayDef playbook[NUM_PLAYS] = {
    {"SLANTS", "Quick slants. Beats the blitz.", PK_PASS, {RT_SLANT, RT_SLANT, RT_FLAT, RT_CHECK}},
    {"CURL FLAT", "Curls sit down vs zones.", PK_PASS, {RT_CURL, RT_CURL, RT_FLAT, RT_CHECK}},
    {"DEEP POST", "Shot downfield. Needs time.", PK_PASS, {RT_POST, RT_GO, RT_SEAM, RT_BLOCK}},
    {"OUTS", "Sideline outs. Stop clock.", PK_PASS, {RT_OUT, RT_OUT, RT_DRAG, RT_FLAT}},
    {"HB SCREEN", "Dump to the RB behind line.", PK_SCREEN, {RT_GO, RT_GO, RT_BLOCK, RT_SCREEN}},
    {"PA BOMB", "Fake the run, go deep.", PK_PLAY_ACTION, {RT_GO, RT_POST, RT_CORNER, RT_BLOCK}},
    {"HB DIVE", "Run up the middle.", PK_RUN_IN, {RT_BLOCK, RT_BLOCK, RT_BLOCK, RT_NONE}},
    {"HB SWEEP", "Run wide to the TE side.", PK_RUN_OUT, {RT_BLOCK, RT_BLOCK, RT_BLOCK, RT_NONE}},
    {"QB SNEAK", "Short yardage push.", PK_SNEAK, {RT_BLOCK, RT_BLOCK, RT_BLOCK, RT_BLOCK}},
    {"KNEEL", "Take a knee. Runs the clock.", PK_KNEEL, {RT_NONE, RT_NONE, RT_NONE, RT_NONE}},
    {"PUNT", "Kick it away.", PK_PUNT, {RT_NONE, RT_NONE, RT_NONE, RT_NONE}},
    {"FIELD GOAL", "Try for 3 points.", PK_FG, {RT_NONE, RT_NONE, RT_NONE, RT_NONE}},
};
