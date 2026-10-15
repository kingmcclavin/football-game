#include "play.h"
#include "rng.h"
#include "util.h"
#include "gba.h"
#include <string.h>

#define W FIELD_W
#define TACKLE_R 3400   /* ~0.83 yd */
#define ENGAGE_R 4300   /* ~1.05 yd */
#define SEP_R 2900      /* ~0.7 yd personal space */

static int is_def(int i) { return i >= NUM_OFF; }

/* ------------------------------------------------------------------ */
/* movement helpers                                                    */
/* ------------------------------------------------------------------ */

static s32 dist_to(const Actor *a, s32 x, s32 y)
{
    return approx_len(x - a->x, y - a->y);
}

static s32 dist_aa(const Actor *a, const Actor *b)
{
    return approx_len(b->x - a->x, b->y - a->y);
}

static void steer(Actor *a, s32 dvx, s32 dvy, s32 accel)
{
    s32 ax = dvx - a->vx, ay = dvy - a->vy;
    s32 l = approx_len(ax, ay);
    if (l > accel && l > 0) {
        ax = ax * accel / l;
        ay = ay * accel / l;
    }
    a->vx += ax;
    a->vy += ay;
}

static void go_to(Actor *a, s32 tx, s32 ty, s32 speed)
{
    s32 dx = tx - a->x, dy = ty - a->y;
    s32 l = approx_len(dx, dy);
    if (l < 200) {
        steer(a, 0, 0, a->accel * 2);
        return;
    }
    s32 sp = speed;
    s32 arrive = l / 5 + 60;
    if (sp > arrive)
        sp = arrive;
    steer(a, dx * sp / l, dy * sp / l, a->accel);
}

static void brake(Actor *a)
{
    steer(a, 0, 0, a->accel * 2);
}

static s32 clamp_y(s32 y, s32 margin)
{
    return CLAMP(y, margin, W - margin);
}

/* ------------------------------------------------------------------ */
/* setup                                                               */
/* ------------------------------------------------------------------ */

static void init_actor(PlayState *ps, int i, s32 x, s32 y, const Ratings *r)
{
    Actor *a = &ps->a[i];
    memset(a, 0, sizeof(*a));
    a->x = a->ax = x;
    a->y = a->ay = y;
    a->r = *r;
    a->side = (u8)is_def(i);
    a->flip = (u8)a->side;
    a->engaged = -1;
    a->target = -1;
    a->maxSpd = (s16)(330 + r->spd * 4);
    a->accel = (s16)(15 + r->agi / 6);
    a->react = (u8)CLAMP(15 - r->skill / 10 - ps->su.iq * 2, 3, 16);
}

static int route_is_pass(int rt)
{
    return rt != RT_NONE && rt != RT_BLOCK;
}

static void set_route(PlayState *ps, int i, int rt)
{
    Actor *a = &ps->a[i];
    const RouteDef *rd = &routes[rt];
    s32 inSign = (a->y < ps->su.spotY) ? 1 : -1;
    if (i == A_RB)
        inSign = (a->y > ps->su.spotY) ? -1 : 1;
    a->nwp = rd->n;
    a->settle = rd->settle;
    a->wp = 0;
    for (int k = 0; k < rd->n; k++) {
        a->wx[k] = a->x + rd->pt[k].dx * 2048;
        a->wy[k] = clamp_y(a->y + rd->pt[k].dy * 2048 * inSign, YDS(1.5));
    }
    a->receiver = (u8)route_is_pass(rt);
}

void play_setup(PlayState *ps, const PlaySetup *su)
{
    memset(ps, 0, sizeof(*ps));
    ps->su = *su;
    ps->play = &playbook[su->playIdx];
    ps->carrier = -1;
    ps->user = -1;
    ps->phase = PP_PRESNAP;
    ps->out.receiver = -1;
    ps->out.carrier = -1;
    ps->out.injured = -1;
    s32 L = su->losX, S = su->spotY;
    int kind = ps->play->kind;
    int underCenter = (kind == PK_SNEAK || kind == PK_KNEEL);
    int iform = (kind == PK_RUN_IN || kind == PK_RUN_OUT || kind == PK_PLAY_ACTION);

    init_actor(ps, A_QB, L - (underCenter ? YDS(1.3) : YDS(5)), S, &su->off[A_QB]);
    if (iform)
        init_actor(ps, A_RB, L - YDS(7.5), S, &su->off[A_RB]);
    else
        init_actor(ps, A_RB, L - YDS(5), S + YDS(2), &su->off[A_RB]);
    s32 wr1y = MAX(S - YDS(16), YDS(3));
    s32 wr2y = MIN(S + YDS(16), W - YDS(3));
    init_actor(ps, A_WR1, L - YDS(0.7), wr1y, &su->off[A_WR1]);
    init_actor(ps, A_WR2, L - YDS(0.7), wr2y, &su->off[A_WR2]);
    init_actor(ps, A_TE, L - YDS(0.9), S + YDS(4.6), &su->off[A_TE]);
    static const s16 oly[4] = {-31, -10, 10, 31};
    for (int k = 0; k < 4; k++)
        init_actor(ps, A_OL1 + k, L - YDS(0.7), S + oly[k] * 410, &su->off[A_OL1 + k]);

    static const s16 dly[3] = {-21, 0, 21};
    for (int k = 0; k < 3; k++)
        init_actor(ps, A_DL1 + k, L + YDS(1.0), S + dly[k] * 410, &su->def[k]);
    init_actor(ps, A_LB1, L + YDS(4.5), S - YDS(3.8), &su->def[A_LB1 - NUM_OFF]);
    init_actor(ps, A_LB2, L + YDS(4.5), S + YDS(3.8), &su->def[A_LB2 - NUM_OFF]);
    init_actor(ps, A_CB1, L + YDS(5.5), wr1y + YDS(0.6), &su->def[A_CB1 - NUM_OFF]);
    init_actor(ps, A_CB2, L + YDS(5.5), wr2y - YDS(0.6), &su->def[A_CB2 - NUM_OFF]);
    init_actor(ps, A_S1, L + YDS(12), clamp_y(S - YDS(8), YDS(4)), &su->def[A_S1 - NUM_OFF]);
    init_actor(ps, A_S2, L + YDS(12), clamp_y(S + YDS(8), YDS(4)), &su->def[A_S2 - NUM_OFF]);

    /* defensive scheme */
    if (su->defCall < 3)
        ps->scheme = su->defCall;
    else
        ps->scheme = (u8)rng_range(3);
    if (ps->scheme == DS_MAN || ps->scheme == DS_BLITZ) {
        ps->a[A_CB1].x = L + YDS(ps->scheme == DS_BLITZ ? 2 : 4);
        ps->a[A_CB2].x = L + YDS(ps->scheme == DS_BLITZ ? 2 : 4);
    }
    /* receivers' routes */
    const u8 *rt = ps->play->route;
    static const u8 order[4] = {A_WR1, A_WR2, A_TE, A_RB};
    for (int k = 0; k < 4; k++)
        set_route(ps, order[k], rt[k]);
    ps->sel = A_WR1;
    for (int k = 0; k < 4; k++)
        if (ps->a[order[k]].receiver) {
            ps->sel = (s8)order[k];
            break;
        }
    ps->ball.x = L;
    ps->ball.y = S;
    ps->ball.z = YDS(0.3);
    ps->ball.state = BALL_SNAP;
    ps->ball.holder = -1;
    ps->ball.intended = -1;
    for (int i = 0; i < NUM_OFF; i++)
        for (int k = 0; k < 16; k++) {
            ps->histX[i][k] = ps->a[i].x;
            ps->histY[i][k] = ps->a[i].y;
        }
}

int play_eligible(const PlayState *ps, s8 *out)
{
    static const u8 order[4] = {A_WR1, A_WR2, A_TE, A_RB};
    int n = 0;
    for (int k = 0; k < 4; k++)
        if (ps->a[order[k]].receiver)
            out[n++] = (s8)order[k];
    return n;
}

int play_open(const PlayState *ps, int idx)
{
    const Actor *r = &ps->a[idx];
    for (int i = NUM_OFF; i < NUM_ACTORS; i++)
        if (!ps->a[i].stun && dist_aa(r, &ps->a[i]) < YDS(2.5))
            return 0;
    return 1;
}

/* ------------------------------------------------------------------ */
/* snap & assignments                                                  */
/* ------------------------------------------------------------------ */

static void assign_defense(PlayState *ps)
{
    s32 L = ps->su.losX, S = ps->su.spotY;
    for (int k = 0; k < 3; k++)
        ps->a[A_DL1 + k].job = J_RUSH;
    Actor *lb1 = &ps->a[A_LB1], *lb2 = &ps->a[A_LB2];
    Actor *cb1 = &ps->a[A_CB1], *cb2 = &ps->a[A_CB2];
    Actor *s1 = &ps->a[A_S1], *s2 = &ps->a[A_S2];
    switch (ps->scheme) {
    case DS_ZONE:
        cb1->job = cb2->job = s1->job = s2->job = lb1->job = lb2->job = J_ZONE;
        cb1->ax = L + YDS(5); cb1->ay = clamp_y(S - YDS(13), YDS(4));
        cb2->ax = L + YDS(5); cb2->ay = clamp_y(S + YDS(13), YDS(4));
        s1->ax = L + YDS(17); s1->ay = clamp_y(S - YDS(9), YDS(6));
        s2->ax = L + YDS(17); s2->ay = clamp_y(S + YDS(9), YDS(6));
        lb1->ax = L + YDS(7); lb1->ay = S - YDS(5);
        lb2->ax = L + YDS(7); lb2->ay = S + YDS(5);
        break;
    case DS_BLITZ:
        cb1->job = cb2->job = s1->job = J_MAN;
        cb1->target = A_WR1;
        cb2->target = A_WR2;
        s1->target = A_TE;
        s2->job = J_ZONE;
        s2->ax = L + YDS(15); s2->ay = S;
        lb1->job = lb2->job = J_RUSH;
        break;
    default:
        cb1->job = cb2->job = s1->job = J_MAN;
        cb1->target = A_WR1;
        cb2->target = A_WR2;
        s1->target = A_TE;
        if (ps->a[A_RB].receiver) {
            lb1->job = J_MAN;
            lb1->target = A_RB;
        } else {
            lb1->job = J_ZONE;
            lb1->ax = L + YDS(6); lb1->ay = S - YDS(4);
        }
        lb2->job = J_ZONE;
        lb2->ax = L + YDS(7); lb2->ay = S + YDS(3);
        s2->job = J_ZONE;
        s2->ax = L + YDS(16); s2->ay = S;
        break;
    }
    if (ps->play->kind == PK_PLAY_ACTION) {
        int bite = ps->su.iq >= 3 ? 10 : 28 - ps->su.iq * 5;
        for (int i = A_LB1; i <= A_LB2; i++) {
            if (ps->a[i].job == J_RUSH)
                continue;
            ps->a[i].job = J_BITE;
            ps->a[i].timer = (s16)bite;
        }
    }
}

void play_snap(PlayState *ps)
{
    if (ps->phase != PP_PRESNAP)
        return;
    ps->phase = PP_SNAP;
    ps->events |= PE_SNAP;
    Ball *b = &ps->ball;
    b->state = BALL_SNAP;
    b->sx = ps->su.losX;
    b->sy = ps->su.spotY;
    b->t = 0;
    b->T = (ps->play->kind == PK_SNEAK || ps->play->kind == PK_KNEEL) ? 4 : 9;
    int kind = ps->play->kind;
    for (int i = 0; i < NUM_OFF; i++) {
        Actor *a = &ps->a[i];
        if (i == A_QB) {
            a->job = J_QB;
            continue;
        }
        if (kind == PK_KNEEL) {
            a->job = J_IDLE;
            continue;
        }
        if (kind == PK_RUN_IN || kind == PK_RUN_OUT || kind == PK_SNEAK) {
            a->job = J_RUNBLOCK;
            continue;
        }
        if (i >= A_OL1) {
            a->job = J_PASSBLOCK;
            if (kind == PK_SCREEN)
                a->timer = 50;
            continue;
        }
        int rt = ps->play->route[i == A_WR1 ? 0 : i == A_WR2 ? 1 : i == A_TE ? 2 : 3];
        if (rt == RT_BLOCK)
            a->job = J_PASSBLOCK;
        else if (rt == RT_CHECK) {
            a->job = J_PASSBLOCK;
            a->timer = 45;
        } else if (rt == RT_NONE)
            a->job = J_IDLE;
        else
            a->job = J_ROUTE;
    }
    if (kind == PK_RUN_IN || kind == PK_RUN_OUT || kind == PK_PLAY_ACTION) {
        Actor *rb = &ps->a[A_RB];
        rb->job = J_HANDOFF;
        s32 L = ps->su.losX, S = ps->su.spotY;
        if (kind == PK_RUN_OUT) {
            rb->wx[0] = L - YDS(2.5); rb->wy[0] = clamp_y(S + YDS(8), YDS(2));
            rb->wx[1] = L + YDS(4); rb->wy[1] = clamp_y(S + YDS(10), YDS(2));
        } else {
            rb->wx[0] = L - YDS(4.6); rb->wy[0] = S + YDS(0.8);
            rb->wx[1] = L + YDS(2); rb->wy[1] = S + YDS(0.8);
        }
        rb->nwp = 2;
        rb->wp = 0;
    }
    if (kind == PK_PLAY_ACTION)
        ps->a[A_RB].timer = 30;
    assign_defense(ps);
    if (kind == PK_KNEEL)
        for (int i = NUM_OFF; i < NUM_ACTORS; i++)
            ps->a[i].job = J_IDLE;
}

/* ------------------------------------------------------------------ */
/* possession changes                                                  */
/* ------------------------------------------------------------------ */

static void end_play(PlayState *ps, int type, s32 spotX)
{
    if (ps->phase == PP_DEAD || ps->phase == PP_DONE)
        return;
    ps->phase = PP_DEAD;
    ps->deadTimer = 75;
    ps->out.type = (u8)type;
    ps->out.spotX = spotX;
    ps->out.spotY = ps->carrier >= 0 ? ps->a[ps->carrier].y : ps->su.spotY;
    ps->out.carrier = ps->carrier;
    ps->out.frames = ps->frame;
    ps->aiming = 0;
    if (ps->ball.state == BALL_HELD)
        ps->ball.state = BALL_DEAD;
    if (type == OUT_TD || type == OUT_INT_TD)
        ps->celebrate = 1;
}

static void run_reaction(PlayState *ps, int quick)
{
    /* everyone switches to chasing / blocking the new ball carrier */
    int carrierSide = ps->a[ps->carrier].side;
    for (int i = 0; i < NUM_ACTORS; i++) {
        Actor *a = &ps->a[i];
        if (i == ps->carrier)
            continue;
        if (a->side == carrierSide) {
            if (i == A_QB && carrierSide == 0) {
                a->job = J_IDLE;
                continue;
            }
            if (a->job != J_PASSBLOCK || a->engaged < 0)
                a->job = J_RUNBLOCK;
            else
                a->job = J_RUNBLOCK;
        } else {
            if (a->engaged >= 0 && a->job == J_RUSH)
                continue; /* stays locked until shed */
            a->job = J_PURSUE;
            a->timer = (s16)(quick ? a->react / 2 : a->react);
        }
    }
}

static void give_ball(PlayState *ps, int idx, int userControl)
{
    ps->carrier = (s8)idx;
    ps->ball.holder = (s8)idx;
    ps->ball.state = BALL_HELD;
    Actor *c = &ps->a[idx];
    c->job = J_CARRIER;
    c->engaged = -1;
    if (userControl)
        ps->user = (s8)idx;
    else if (ps->user == idx)
        ps->user = -1;
}

static void disengage(PlayState *ps, int i)
{
    Actor *a = &ps->a[i];
    if (a->engaged >= 0) {
        Actor *o = &ps->a[a->engaged];
        if (o->engaged == i)
            o->engaged = -1;
        a->engaged = -1;
    }
}

/* ------------------------------------------------------------------ */
/* passing                                                             */
/* ------------------------------------------------------------------ */

static s32 pass_speed(const PlayState *ps, int power)
{
    s32 lob = 1260;
    s32 bullet = 1720 + ps->a[A_QB].r.arm * 5;
    return lob + (bullet - lob) * power / 100;
}

static s32 max_range(const PlayState *ps)
{
    return YDS(35) + ps->a[A_QB].r.arm * 1229 / 4;
}

static void compute_aim(PlayState *ps)
{
    const Actor *q = &ps->a[A_QB];
    const Actor *r = &ps->a[ps->sel];
    s32 sp = pass_speed(ps, ps->power);
    s32 tx = r->x, ty = r->y;
    s32 T = 10;
    for (int it = 0; it < 3; it++) {
        s32 d = approx_len(tx - q->x, ty - q->y);
        T = d / sp;
        if (T < 8)
            T = 8;
        if (T > 140)
            T = 140;
        tx = r->x + r->vx * T;
        ty = r->y + r->vy * T;
    }
    tx += ps->aimOffX;
    ty += ps->aimOffY;
    s32 dx = tx - q->x, dy = ty - q->y;
    s32 d = approx_len(dx, dy);
    s32 mr = max_range(ps);
    if (d > mr && d > 0) {
        tx = q->x + dx * (mr / 256) / (d / 256);
        ty = q->y + dy * (mr / 256) / (d / 256);
        d = mr;
    }
    T = d / sp;
    ps->aimTx = tx;
    ps->aimTy = ty;
    ps->aimT = (s16)CLAMP(T, 8, 140);
}

static void launch(PlayState *ps, s32 tx, s32 ty, int T, int state)
{
    Ball *b = &ps->ball;
    const Actor *q = &ps->a[ps->carrier >= 0 ? ps->carrier : A_QB];
    b->sx = q->x + YDS(0.4);
    b->sy = q->y;
    b->tx = tx;
    b->ty = ty;
    b->t = 0;
    b->T = (s16)T;
    b->apex = (s32)T * T * 3;
    b->state = (u8)state;
    b->holder = -1;
    ps->carrier = -1;
}

static void throw_pass(PlayState *ps)
{
    Actor *q = &ps->a[A_QB];
    compute_aim(ps);
    s32 tx = ps->aimTx, ty = ps->aimTy;
    s32 d = approx_len(tx - q->x, ty - q->y);
    /* accuracy: ratings, pressure, movement, power, distance */
    s32 err = 9830 - q->r.acc * 82;
    if (err < 1200)
        err = 1200;
    s32 nearest = YDS(99);
    for (int i = NUM_OFF; i < NUM_ACTORS; i++)
        if (!ps->a[i].stun)
            nearest = MIN(nearest, dist_aa(q, &ps->a[i]));
    if (nearest < YDS(2.5))
        err += YDS(0.9);
    if (approx_len(q->vx, q->vy) > q->maxSpd / 2)
        err += YDS(0.5);
    if (ps->power >= 95)
        err += YDS(0.4);
    err += d / 28;
    s32 ex = err * (rng_range(513) - 256) / 256;
    s32 ey = err * (rng_range(513) - 256) / 256 * 3 / 4;
    tx += ex;
    ty += ey;
    s32 T = ps->aimT;
    ps->ball.power = ps->power;
    launch(ps, tx, ty, T, BALL_AIR);
    ps->aiming = 0;
    ps->throwFrame = 1;
    ps->events |= PE_THROW;
    ps->out.pass = 1;
    /* intended receiver: eligible player closest to the landing spot */
    s8 el[4];
    int n = play_eligible(ps, el);
    int best = -1;
    s32 bd = YDS(8);
    for (int k = 0; k < n; k++) {
        Actor *r = &ps->a[el[k]];
        s32 dd = dist_to(r, tx, ty);
        if (dd < bd) {
            bd = dd;
            best = el[k];
        }
    }
    ps->ball.intended = (s8)best;
    if (best >= 0)
        ps->a[best].job = J_BALL;
    /* defenders read the throw */
    for (int i = NUM_OFF; i < NUM_ACTORS; i++) {
        Actor *a = &ps->a[i];
        if (a->engaged >= 0 || a->stun)
            continue;
        s32 dd = dist_to(a, tx, ty);
        s32 reach = (a->maxSpd * (T + 6 - a->react));
        if (dd < reach && (a->job == J_MAN || a->job == J_ZONE || a->job == J_BITE)) {
            a->job = J_BALL;
            a->timer = a->react;
        }
    }
    ps->phase = PP_AIR;
}

static void throw_away(PlayState *ps)
{
    Actor *q = &ps->a[A_QB];
    s32 ty = q->y < W / 2 ? -YDS(4) : W + YDS(4);
    launch(ps, q->x + YDS(6), ty, 26, BALL_AWAY);
    ps->ball.power = 100;
    ps->events |= PE_THROW;
    ps->out.pass = 1;
    ps->out.throwaway = 1;
    ps->phase = PP_AIR;
}

static void resolve_catch(PlayState *ps)
{
    Ball *b = &ps->ball;
    s32 px = b->tx, py = b->ty;
    int best = -1, bestD = -1;
    s32 rd = YDS(99), dd = YDS(99);
    s8 el[4];
    int n = play_eligible(ps, el);
    for (int k = 0; k < n; k++) {
        Actor *r = &ps->a[el[k]];
        if (r->stun || r->engaged >= 0)
            continue;
        s32 d = dist_to(r, px, py);
        if (d < rd) {
            rd = d;
            best = el[k];
        }
    }
    for (int i = NUM_OFF; i < NUM_ACTORS; i++) {
        Actor *a = &ps->a[i];
        if (a->stun || a->engaged >= 0)
            continue;
        s32 d = dist_to(a, px, py);
        if (d < dd) {
            dd = d;
            bestD = i;
        }
    }
    int oob = py < 0 || py > W || px > YDS(110) || px < YDS(-10);
    b->state = BALL_DEAD;
    b->z = 0;
    if (oob) {
        ps->events |= PE_INCOMPLETE | PE_OOB;
        end_play(ps, OUT_INCOMPLETE, ps->su.losX);
        return;
    }
    s32 catchR = YDS(1.3) + (best >= 0 ? ps->a[best].r.hands * 20 : 0);
    s32 defR = YDS(1.1) + (bestD >= 0 ? ps->a[bestD].r.skill * 14 : 0);
    int recvIn = best >= 0 && rd <= catchR;
    int defIn = bestD >= 0 && dd <= defR;
    if (defIn && (!recvIn || dd + YDS(0.4) < rd)) {
        Actor *d = &ps->a[bestD];
        int pInt = 18 + (d->r.hands - 40) / 2 + ps->su.iq * 3;
        if (rng_chance(CLAMP(pInt, 8, 55))) {
            ps->events |= PE_INT;
            ps->out.intX = px;
            ps->ballSide = 1;
            d->x = px;
            d->y = py;
            give_ball(ps, bestD, 0);
            run_reaction(ps, 1);
            ps->phase = PP_RUN;
            return;
        }
        ps->events |= PE_BROKEN_UP | PE_INCOMPLETE;
        end_play(ps, OUT_INCOMPLETE, ps->su.losX);
        return;
    }
    if (recvIn) {
        Actor *r = &ps->a[best];
        int p = 86 + (r->r.hands - 70) / 2;
        int contested = bestD >= 0 && dist_aa(r, &ps->a[bestD]) < YDS(1.6);
        if (contested)
            p -= 18 + (ps->a[bestD].r.skill - 60) / 3;
        if (b->power > 85)
            p -= 6;
        if (rd > YDS(1.0))
            p -= 10;
        p = CLAMP(p, 25, 98);
        if (rng_chance(p)) {
            ps->events |= PE_CATCH | (contested ? PE_BIGCATCH : 0);
            ps->out.complete = 1;
            ps->out.receiver = (s8)best;
            r->x = px;
            r->y = py;
            give_ball(ps, best, 1);
            run_reaction(ps, 1);
            ps->phase = PP_RUN;
            if (r->x >= YDS(100)) {
                ps->events |= PE_TD;
                end_play(ps, OUT_TD, r->x);
            }
            return;
        }
        if (contested && bestD >= 0 && rng_chance(14)) {
            Actor *d = &ps->a[bestD];
            ps->events |= PE_INT;
            ps->out.intX = px;
            ps->ballSide = 1;
            d->x = px;
            d->y = py;
            give_ball(ps, bestD, 0);
            run_reaction(ps, 1);
            ps->phase = PP_RUN;
            return;
        }
        ps->events |= PE_DROP | PE_INCOMPLETE;
        end_play(ps, OUT_INCOMPLETE, ps->su.losX);
        return;
    }
    if (best >= 0 && rd <= catchR + YDS(1.3)) {
        Actor *r = &ps->a[best];
        int p = (r->r.hands - 52) / 2;
        if (rng_chance(CLAMP(p, 3, 24))) {
            ps->events |= PE_CATCH | PE_DIVING;
            ps->out.complete = 1;
            ps->out.diving = 1;
            ps->out.receiver = (s8)best;
            r->x = px;
            r->y = py;
            r->down = 1;
            give_ball(ps, best, 1);
            if (px >= YDS(100)) {
                ps->events |= PE_TD;
                end_play(ps, OUT_TD, px);
            } else {
                end_play(ps, OUT_TACKLE, px);
            }
            return;
        }
    }
    ps->events |= PE_INCOMPLETE;
    end_play(ps, OUT_INCOMPLETE, ps->su.losX);
}

/* ------------------------------------------------------------------ */
/* tackling                                                            */
/* ------------------------------------------------------------------ */

static int elusiveness(const Actor *c)
{
    return (c->r.str + c->r.agi) / 2;
}

static void tackle_made(PlayState *ps, Actor *c)
{
    int offenseBall = ps->ballSide == 0;
    s32 x = c->x;
    c->down = 1;
    ps->events |= PE_TACKLE;
    if (offenseBall) {
        int isSack = ps->carrier == A_QB && !ps->crossedLOS && ps->play->kind != PK_SNEAK &&
                     ps->play->kind != PK_KNEEL && x < ps->su.losX + YDS(1);
        int fumP = 14 - (c->r.hands - 50) / 4;
        if (rng_chance1000(CLAMP(fumP, 4, 30)) && rng_chance(55)) {
            ps->events |= PE_FUMBLE;
            end_play(ps, OUT_FUMBLE, x);
            return;
        }
        if (rng_chance1000(6))
            ps->out.injured = ps->carrier;
        if (x <= 0) {
            end_play(ps, OUT_SAFETY, x);
            return;
        }
        if (isSack) {
            ps->events |= PE_SACK;
            end_play(ps, OUT_SACK, x);
            return;
        }
        end_play(ps, OUT_TACKLE, x);
    } else {
        end_play(ps, OUT_INT, x);
    }
}

static void check_tackles(PlayState *ps)
{
    if (ps->carrier < 0 || ps->dive)
        return;
    Actor *c = &ps->a[ps->carrier];
    int defSide = c->side ^ 1;
    for (int i = 0; i < NUM_ACTORS; i++) {
        Actor *d = &ps->a[i];
        if (d->side != defSide || d->stun || d->down || d->engaged >= 0 || d->cool)
            continue;
        if (dist_aa(d, c) > TACKLE_R)
            continue;
        d->cool = 20;
        int tk = defSide == 1 ? d->r.tackle : (d->r.str + d->r.agi) / 2 - 8;
        int p = 73 + (tk - elusiveness(c)) / 2 + (s8)ps->su.tackleBonus;
        /* gang tackle */
        for (int j = 0; j < NUM_ACTORS; j++)
            if (j != i && ps->a[j].side == defSide && !ps->a[j].stun && ps->a[j].engaged < 0 &&
                dist_aa(&ps->a[j], c) < YDS(2))
                p += 14;
        if (ps->stiff && ps->carrier == ps->user)
            p -= (c->r.str - 30) / 2;
        if (c->job == J_CARRIER && ps->carrier == A_QB && ps->phase == PP_LIVE)
            p -= 12 + (c->r.agi - 50) / 4; /* QB escapes in the pocket */
        p = CLAMP(p, 12, 96);
        if (ps->juke && ps->carrier == ps->user && rng_chance(30 + c->r.agi / 2))
            p = 0;
        if (rng_chance(p)) {
            tackle_made(ps, c);
            return;
        }
        d->stun = 28;
        ps->events |= PE_MISSED_TACKLE;
        if (ps->stiff)
            ps->events |= PE_STIFFARM;
        c->vx = c->vx * 3 / 4;
        c->vy = c->vy * 3 / 4;
    }
}

/* ------------------------------------------------------------------ */
/* per-actor AI                                                        */
/* ------------------------------------------------------------------ */

static int block_power(const Actor *a)
{
    return (a->r.skill + a->r.str) / 2;
}

static int rush_power(const Actor *a)
{
    return (a->r.rush + a->r.str) / 2;
}

static void engage(PlayState *ps, int blocker, int def, int pass)
{
    Actor *b = &ps->a[blocker], *d = &ps->a[def];
    b->engaged = (s8)def;
    d->engaged = (s8)blocker;
    int diff = block_power(b) - (pass ? rush_power(d) : (d->r.tackle + d->r.str) / 2);
    int t = (pass ? 85 : 26) + diff * (pass ? 2 : 1) + rng_between(0, pass ? 40 : 22) - ps->su.iq * (pass ? 8 : 3);
    if (!pass && ps->out.complete)
        t = 10 + rng_between(0, 14); /* open-field blocks after a catch are brief */
    d->timer = (s16)CLAMP(t, 20, 200);
}

static s32 carrier_x(const PlayState *ps)
{
    return ps->carrier >= 0 ? ps->a[ps->carrier].x : ps->ball.x;
}

static void ai_block(PlayState *ps, int i, int pass)
{
    Actor *a = &ps->a[i];
    if (a->engaged >= 0) {
        /* stay between the defender and the ball */
        Actor *d = &ps->a[a->engaged];
        s32 gx = ps->carrier >= 0 ? ps->a[ps->carrier].x : ps->a[A_QB].x;
        s32 gy = ps->carrier >= 0 ? ps->a[ps->carrier].y : ps->a[A_QB].y;
        s32 dx = gx - d->x, dy = gy - d->y;
        s32 l = approx_len(dx, dy);
        if (l < 1)
            l = 1;
        s32 tx = d->x + dx * 3600 / l, ty = d->y + dy * 3600 / l;
        a->x += (tx - a->x) / 3;
        a->y += (ty - a->y) / 3;
        a->vx = d->vx;
        a->vy = d->vy;
        return;
    }
    /* pick a target */
    int best = -1;
    s32 bd = pass ? YDS(7) : YDS(6);
    s32 cx = carrier_x(ps);
    s32 qx = ps->a[A_QB].x, qy = ps->a[A_QB].y;
    for (int j = NUM_OFF; j < NUM_ACTORS; j++) {
        Actor *d = &ps->a[j];
        if (d->stun || d->down || d->engaged >= 0 || d->cool > 20)
            continue;
        s32 dd = dist_aa(a, d);
        if (pass) {
            if (d->job != J_RUSH || dist_to(d, qx, qy) > YDS(9))
                continue;
        } else {
            if (d->x < cx - YDS(3))
                continue;
            /* only block defenders we are actually between / closer to */
            if (ps->carrier >= 0 && dd * 5 > dist_aa(&ps->a[ps->carrier], d) * 4)
                continue;
        }
        if (dd < bd) {
            bd = dd;
            best = j;
        }
    }
    if (best < 0) {
        if (pass)
            go_to(a, a->ax - YDS(1), a->ay, a->maxSpd / 2);
        else if (ps->carrier >= 0)
            go_to(a, ps->a[ps->carrier].x + YDS(4), a->y, a->maxSpd);
        else
            brake(a);
        return;
    }
    Actor *d = &ps->a[best];
    if (bd < ENGAGE_R) {
        engage(ps, i, best, pass);
        return;
    }
    s32 gx = pass ? qx : (ps->carrier >= 0 ? ps->a[ps->carrier].x : qx);
    s32 gy = pass ? qy : (ps->carrier >= 0 ? ps->a[ps->carrier].y : qy);
    s32 dx = gx - d->x, dy = gy - d->y;
    s32 l = approx_len(dx, dy);
    if (l < 1)
        l = 1;
    go_to(a, d->x + dx * 3000 / l, d->y + dy * 3000 / l, a->maxSpd);
}

static void ai_route(PlayState *ps, Actor *a)
{
    if (a->wp < a->nwp) {
        s32 tx = a->wx[a->wp], ty = a->wy[a->wp];
        if (dist_to(a, tx, ty) < YDS(0.6)) {
            a->wp++;
        } else {
            go_to(a, tx, ty, a->maxSpd);
            return;
        }
    }
    if (a->settle || a->nwp == 0) {
        brake(a);
        a->flip = 1;
        return;
    }
    /* keep running in the direction of the last leg */
    int k = a->nwp - 1;
    s32 px = k > 0 ? a->wx[k - 1] : a->ax, py = k > 0 ? a->wy[k - 1] : a->ay;
    s32 dx = a->wx[k] - px, dy = a->wy[k] - py;
    s32 l = approx_len(dx, dy);
    if (l < 1)
        l = 1;
    s32 tx = a->x + dx * YDS(10) / l, ty = clamp_y(a->y + dy * YDS(10) / l, YDS(1.2));
    go_to(a, tx, ty, a->maxSpd);
}

static void ai_man(PlayState *ps, Actor *a)
{
    int t = a->target;
    if (t < 0) {
        brake(a);
        return;
    }
    const Actor *r = &ps->a[t];
    int delay = 7 + (r->r.skill - a->r.skill) / 5 - ps->su.iq * 2;
    delay = CLAMP(delay, 2, 15);
    int h = (ps->histPos - delay) & 15;
    s32 tx = ps->histX[t][h] + YDS(1.2);
    s32 ty = ps->histY[t][h];
    if (!r->receiver || r->job == J_PASSBLOCK) {
        /* receiver stayed in to block: spy the QB area */
        tx = ps->su.losX + YDS(4);
        ty = a->ay;
    }
    go_to(a, tx, ty, a->maxSpd);
}

static void ai_zone(PlayState *ps, Actor *a)
{
    int best = -1;
    int deep = a->ax > ps->su.losX + YDS(12);
    s32 bd = deep ? YDS(14) : YDS(9);
    s32 bx = -YDS(99);
    for (int i = 0; i < NUM_OFF; i++) {
        Actor *r = &ps->a[i];
        if (!r->receiver || r->job != J_ROUTE)
            continue;
        s32 d = dist_to(r, a->ax, a->ay);
        if (deep) {
            /* deep defenders take the deepest threat in their area */
            if (d < bd && r->x > bx) {
                bx = r->x;
                best = i;
            }
        } else if (d < bd) {
            bd = d;
            best = i;
        }
    }
    s32 tx = a->ax, ty = a->ay;
    if (best >= 0) {
        Actor *r = &ps->a[best];
        if (deep) {
            tx = MAX(r->x + YDS(2), a->ax - YDS(3));
            ty = (a->ay + r->y * 3) / 4;
        } else {
            tx = (a->ax * 3 + r->x * 7) / 10 + YDS(1);
            ty = (a->ay * 3 + r->y * 7) / 10;
        }
    }
    go_to(a, tx, ty, a->maxSpd);
}

static void ai_pursue(PlayState *ps, Actor *a)
{
    if (a->timer > 0) {
        a->timer--;
        steer(a, a->vx, a->vy, a->accel);
        return;
    }
    if (ps->carrier < 0) {
        if (ps->ball.state == BALL_AIR || ps->ball.state == BALL_PITCH)
            go_to(a, ps->ball.tx, ps->ball.ty, a->maxSpd);
        else
            brake(a);
        return;
    }
    const Actor *c = &ps->a[ps->carrier];
    s32 d = dist_aa(a, c);
    s32 lead = a->maxSpd > 0 ? d / a->maxSpd : 0;
    lead = MIN(lead, 40);
    static const u8 leadPct[4] = {35, 60, 85, 100};
    lead = lead * leadPct[MIN(ps->su.iq, 3)] / 100;
    /* pursuit burst: defenders close faster in the open field */
    static const u8 burst[4] = {4, 9, 13, 16};
    s32 sp = a->maxSpd + a->maxSpd * burst[MIN(ps->su.iq, 3)] / 100;
    go_to(a, c->x + c->vx * lead, c->y + c->vy * lead, sp);
}

static void ai_rush(PlayState *ps, Actor *a, int idx)
{
    s32 tx, ty;
    if (ps->carrier >= 0) {
        tx = ps->a[ps->carrier].x;
        ty = ps->a[ps->carrier].y;
    } else {
        tx = ps->a[A_QB].x;
        ty = ps->a[A_QB].y;
    }
    if (a->engaged >= 0) {
        Actor *b = &ps->a[a->engaged];
        if (--a->timer <= 0) {
            disengage(ps, idx);
            a->cool = 30; /* blockers ignore him briefly */
            b->stun = 10;
            go_to(a, tx, ty, a->maxSpd);
            return;
        }
        s32 dx = tx - a->x, dy = ty - a->y;
        s32 l = approx_len(dx, dy);
        if (l < 1)
            l = 1;
        int push = 55 + (rush_power(a) - block_power(b)) * 3;
        push = CLAMP(push, 15, 180);
        a->vx = dx * push / l;
        a->vy = dy * push / l;
        return;
    }
    go_to(a, tx, ty, a->maxSpd);
}

static void ai_carrier_def(PlayState *ps, Actor *a)
{
    /* interception return: run toward the offense's end zone, dodge */
    s32 tx = a->x - YDS(10), ty = a->y;
    s32 nd = YDS(99);
    int ni = -1;
    for (int i = 0; i < NUM_OFF; i++) {
        s32 d = dist_aa(a, &ps->a[i]);
        if (d < nd && !ps->a[i].stun) {
            nd = d;
            ni = i;
        }
    }
    if (ni >= 0 && nd < YDS(5)) {
        ty += (a->y > ps->a[ni].y) ? YDS(4) : -YDS(4);
    }
    ty = clamp_y(ty, YDS(2));
    go_to(a, tx, ty, a->maxSpd * 9 / 10);
}

static void user_move(PlayState *ps, Actor *a, u16 held)
{
    int pocket = ps->carrier == A_QB && !ps->crossedLOS && ps->ballSide == 0 &&
                 (ps->phase == PP_LIVE || ps->phase == PP_SNAP);
    s32 dx = 0, dy = 0;
    if (held & KEY_UP) dy = -1;
    if (held & KEY_DOWN) dy = 1;
    if (pocket) {
        if (held & KEY_RIGHT) dx = 1;
        if (held & KEY_LEFT) dx = -1;
        if (!dx && !dy) {
            /* drop back a couple of steps after the snap */
            if (ps->frame < 22 && ps->play->kind != PK_SNEAK)
                go_to(a, ps->su.losX - YDS(7), a->y, a->maxSpd / 2);
            else
                brake(a);
            return;
        }
    } else {
        dx = (held & KEY_LEFT) ? -1 : 1;
    }
    s32 sp = a->maxSpd;
    if (ps->aiming)
        sp = sp * 2 / 3;
    s32 vx = dx * sp, vy = dy * sp;
    if (dx && dy) {
        vx = vx * 181 / 256;
        vy = vy * 181 / 256;
    }
    steer(a, vx, vy, a->accel + 4);
}

/* ------------------------------------------------------------------ */
/* frame update                                                        */
/* ------------------------------------------------------------------ */

static void update_ball(PlayState *ps)
{
    Ball *b = &ps->ball;
    switch (b->state) {
    case BALL_SNAP: {
        const Actor *q = &ps->a[A_QB];
        b->t++;
        b->x = b->sx + (q->x - b->sx) * b->t / b->T;
        b->y = b->sy + (q->y - b->sy) * b->t / b->T;
        b->z = YDS(0.4) + YDS(1) * b->t / b->T;
        if (b->t >= b->T) {
            int kind = ps->play->kind;
            int userQB = kind == PK_PASS || kind == PK_SCREEN || kind == PK_SNEAK;
            give_ball(ps, A_QB, userQB);
            ps->a[A_QB].job = J_QB;
            ps->phase = PP_LIVE;
            if (kind == PK_SNEAK) {
                ps->a[A_QB].job = J_CARRIER;
                ps->crossedLOS = 1;
                ps->phase = PP_RUN;
                run_reaction(ps, 1);
            }
        }
        break;
    }
    case BALL_HELD:
        if (b->holder >= 0) {
            const Actor *h = &ps->a[b->holder];
            b->x = h->x + (h->flip ? -YDS(0.3) : YDS(0.3));
            b->y = h->y;
            b->z = YDS(1.1);
        }
        break;
    case BALL_AIR:
    case BALL_PITCH:
    case BALL_AWAY: {
        b->t++;
        s32 t = b->t, T = b->T;
        b->x = b->sx + (b->tx - b->sx) / T * t;
        b->y = b->sy + (b->ty - b->sy) / T * t;
        s32 z0 = YDS(2), z1 = YDS(1);
        b->z = z0 + (z1 - z0) * t / T + 4 * b->apex / T * t / T * (T - t);
        if (t >= T) {
            b->x = b->tx;
            b->y = b->ty;
            if (b->state == BALL_AWAY) {
                b->state = BALL_DEAD;
                b->z = 0;
                ps->events |= PE_INCOMPLETE;
                end_play(ps, OUT_INCOMPLETE, ps->su.losX);
            } else if (b->state == BALL_PITCH) {
                Actor *rb = &ps->a[A_RB];
                rb->x = b->x;
                rb->y = b->y;
                give_ball(ps, A_RB, 1);
                ps->events |= PE_HANDOFF;
                run_reaction(ps, 0);
                ps->phase = PP_RUN;
            } else {
                resolve_catch(ps);
            }
        }
        break;
    }
    default:
        break;
    }
}

static void update_handoff(PlayState *ps)
{
    int kind = ps->play->kind;
    if (kind != PK_RUN_IN && kind != PK_RUN_OUT && kind != PK_PLAY_ACTION)
        return;
    if (ps->carrier != A_QB || ps->phase != PP_LIVE)
        return;
    Actor *q = &ps->a[A_QB], *rb = &ps->a[A_RB];
    if (kind == PK_RUN_OUT) {
        if (ps->frame >= 16) {
            s32 tx = rb->x + rb->vx * 14, ty = rb->y + rb->vy * 14;
            ps->ball.intended = A_RB;
            launch(ps, tx, ty, 14, BALL_PITCH);
            ps->ball.apex = 600;
            ps->events |= PE_THROW;
            ps->phase = PP_HANDOFF;
        }
        return;
    }
    if (ps->frame >= 12 && (dist_aa(q, rb) < YDS(1.4) || ps->frame >= 44)) {
        if (kind == PK_PLAY_ACTION) {
            if (rb->job == J_HANDOFF) {
                rb->job = J_PASSBLOCK;
                ps->events |= PE_HANDOFF;
                ps->user = A_QB;
            }
            return;
        }
        give_ball(ps, A_RB, 1);
        ps->events |= PE_HANDOFF;
        run_reaction(ps, 0);
        ps->phase = PP_RUN;
    }
}

static void record_history(PlayState *ps)
{
    ps->histPos = (u8)((ps->histPos + 1) & 15);
    for (int i = 0; i < NUM_OFF; i++) {
        ps->histX[i][ps->histPos] = ps->a[i].x;
        ps->histY[i][ps->histPos] = ps->a[i].y;
    }
}

static void update_actor(PlayState *ps, int i, u16 held)
{
    Actor *a = &ps->a[i];
    if (a->down) {
        a->vx = a->vy = 0;
        return;
    }
    if (a->stun) {
        a->stun--;
        brake(a);
        return;
    }
    if (a->cool)
        a->cool--;
    if (ps->phase == PP_DEAD) {
        brake(a);
        return;
    }
    if (i == ps->user && i == ps->carrier) {
        if (ps->dive) {
            ps->dive--;
            if (!ps->dive) {
                a->down = 1;
                end_play(ps, a->x <= 0 ? OUT_SAFETY : OUT_TACKLE, a->x);
            }
            return;
        }
        user_move(ps, a, held);
        return;
    }
    switch (a->job) {
    case J_QB:
        if (ps->carrier == A_QB && ps->play->kind == PK_KNEEL) {
            brake(a);
            if (ps->frame > 30) {
                a->down = 1;
                end_play(ps, OUT_KNEEL, a->x);
            }
        } else if (ps->play->kind == PK_RUN_IN || ps->play->kind == PK_PLAY_ACTION) {
            go_to(a, a->ax + YDS(0.5), a->ay + YDS(0.6), a->maxSpd / 3);
        } else {
            brake(a);
        }
        break;
    case J_ROUTE:
        ai_route(ps, a);
        break;
    case J_PASSBLOCK:
        if (a->timer > 0 && a->engaged < 0) {
            if (--a->timer == 0) {
                if (i >= A_OL1) {
                    a->job = J_RUNBLOCK;
                } else {
                    a->job = J_ROUTE;
                    a->receiver = 1;
                }
                break;
            }
        }
        ai_block(ps, i, 1);
        break;
    case J_RUNBLOCK:
        ai_block(ps, i, 0);
        break;
    case J_HANDOFF:
        if (a->wp < a->nwp) {
            if (dist_to(a, a->wx[a->wp], a->wy[a->wp]) < YDS(0.8))
                a->wp++;
            else
                go_to(a, a->wx[a->wp], a->wy[a->wp], a->maxSpd);
        } else {
            go_to(a, a->x + YDS(5), a->y, a->maxSpd);
        }
        break;
    case J_CARRIER:
        if (a->side == 1)
            ai_carrier_def(ps, a);
        else
            go_to(a, a->x + YDS(5), a->y, a->maxSpd);
        break;
    case J_RUSH:
        ai_rush(ps, a, i);
        break;
    case J_MAN:
        ai_man(ps, a);
        break;
    case J_ZONE:
        ai_zone(ps, a);
        break;
    case J_BITE:
        if (--a->timer <= 0) {
            a->job = J_ZONE;
            a->ax = ps->su.losX + YDS(7);
        } else {
            go_to(a, ps->su.losX + YDS(1), a->y, a->maxSpd / 2);
        }
        break;
    case J_PURSUE:
        ai_pursue(ps, a);
        break;
    case J_BALL:
        if (a->timer > 0) {
            a->timer--;
            if (a->side)
                ai_man(ps, a);
            break;
        }
        if (ps->ball.state == BALL_AIR)
            go_to(a, ps->ball.tx, ps->ball.ty, a->maxSpd);
        else
            ai_pursue(ps, a);
        break;
    default:
        brake(a);
        break;
    }
}

static void separate(PlayState *ps)
{
    for (int i = 0; i < NUM_ACTORS; i++) {
        Actor *a = &ps->a[i];
        if (a->down)
            continue;
        for (int j = i + 1; j < NUM_ACTORS; j++) {
            Actor *b = &ps->a[j];
            if (b->down || a->engaged == j)
                continue;
            if ((i == ps->carrier && b->side != a->side) || (j == ps->carrier && a->side != b->side))
                continue;
            s32 dx = b->x - a->x, dy = b->y - a->y;
            if (ABS(dx) > SEP_R || ABS(dy) > SEP_R)
                continue;
            s32 l = approx_len(dx, dy);
            if (l >= SEP_R)
                continue;
            if (l < 16) {
                dx = 16;
                dy = (i & 1) ? 16 : -16;
                l = 23;
            }
            s32 push = (SEP_R - l) / 2;
            s32 px = dx * push / l, py = dy * push / l;
            if (i != ps->carrier) {
                a->x -= px;
                a->y -= py;
            }
            if (j != ps->carrier) {
                b->x += px;
                b->y += py;
            }
        }
    }
}

static void check_boundaries(PlayState *ps)
{
    if (ps->carrier < 0 || ps->phase == PP_DEAD)
        return;
    Actor *c = &ps->a[ps->carrier];
    if (ps->ballSide == 0) {
        if (c->x >= YDS(100)) {
            ps->events |= PE_TD;
            end_play(ps, OUT_TD, c->x);
            return;
        }
        if (c->y < 0 || c->y > W || c->x < YDS(-10)) {
            ps->events |= PE_OOB;
            end_play(ps, c->x <= 0 ? OUT_SAFETY : OUT_OOB, c->x);
            return;
        }
        if (c == &ps->a[A_QB] && !ps->crossedLOS && c->x > ps->su.losX + YDS(0.5)) {
            ps->crossedLOS = 1;
            ps->aiming = 0;
            ps->phase = PP_RUN;
            run_reaction(ps, 0);
        }
    } else {
        if (c->x <= 0) {
            ps->events |= PE_TD;
            end_play(ps, OUT_INT_TD, c->x);
            return;
        }
        if (c->y < 0 || c->y > W || c->x > YDS(110)) {
            end_play(ps, OUT_INT, c->x);
            return;
        }
    }
}

static void handle_input(PlayState *ps, u16 held, u16 pressed, u16 released)
{
    int qbPocket = ps->phase == PP_LIVE && ps->carrier == A_QB && !ps->crossedLOS &&
                   ps->ballSide == 0 && ps->play->kind != PK_KNEEL &&
                   (ps->play->kind == PK_PASS || ps->play->kind == PK_SCREEN ||
                    (ps->play->kind == PK_PLAY_ACTION && ps->a[A_RB].job != J_HANDOFF));
    if (qbPocket) {
        if (pressed & (KEY_L | KEY_R)) {
            s8 el[4];
            int n = play_eligible(ps, el);
            int cur = 0;
            for (int k = 0; k < n; k++)
                if (el[k] == ps->sel)
                    cur = k;
            if (n) {
                cur = (pressed & KEY_R) ? (cur + 1) % n : (cur + n - 1) % n;
                ps->sel = el[cur];
            }
            ps->aimOffX = ps->aimOffY = 0;
        }
        if ((pressed & KEY_A) && !ps->aiming) {
            ps->aiming = 1;
            ps->power = 0;
            ps->aimOffX = ps->aimOffY = 0;
        }
        if (ps->aiming) {
            if (held & KEY_A)
                ps->power = (u8)MIN(100, ps->power + 3);
            s32 step = 900;
            if (held & KEY_UP) ps->aimOffY = MAX(ps->aimOffY - step, -YDS(8));
            if (held & KEY_DOWN) ps->aimOffY = MIN(ps->aimOffY + step, YDS(8));
            if (held & KEY_RIGHT) ps->aimOffX = MIN(ps->aimOffX + step, YDS(10));
            if (held & KEY_LEFT) ps->aimOffX = MAX(ps->aimOffX - step, -YDS(8));
            compute_aim(ps);
            if (released & KEY_A) {
                if (ps->power < 10)
                    ps->power = 10;
                throw_pass(ps);
            }
        } else if (pressed & KEY_B) {
            throw_away(ps);
        }
        return;
    }
    ps->aiming = 0;
    /* ball carrier moves */
    if (ps->carrier >= 0 && ps->carrier == ps->user && ps->phase == PP_RUN && !ps->dive) {
        Actor *c = &ps->a[ps->carrier];
        if ((pressed & KEY_A) && ps->jukeCool == 0) {
            s32 dir = (held & KEY_UP) ? -1 : (held & KEY_DOWN) ? 1 : 0;
            if (!dir) {
                /* away from the nearest defender */
                s32 nd = YDS(99);
                int ni = -1;
                for (int i = NUM_OFF; i < NUM_ACTORS; i++) {
                    s32 d = dist_aa(c, &ps->a[i]);
                    if (d < nd) {
                        nd = d;
                        ni = i;
                    }
                }
                dir = (ni >= 0 && ps->a[ni].y > c->y) ? -1 : 1;
            }
            c->vy = dir * c->maxSpd * 5 / 4;
            c->vx = c->vx / 2;
            ps->juke = 14;
            ps->jukeCool = 40;
            ps->events |= PE_JUKE;
        } else if ((pressed & KEY_R) && ps->stiffCool == 0) {
            ps->stiff = 18;
            ps->stiffCool = 50;
            ps->events |= PE_STIFFARM;
        } else if (pressed & KEY_B) {
            ps->dive = 20;
            c->vx = (c->vx > 0 ? c->vx : 0) + c->maxSpd / 2;
        }
    }
}

void play_update(PlayState *ps, u16 held, u16 pressed, u16 released)
{
    ps->events = 0;
    if (ps->phase == PP_PRESNAP || ps->phase == PP_DONE)
        return;
    ps->realFrame++;
    if (ps->phase != PP_DEAD)
        handle_input(ps, held, pressed, released);
    /* slow motion while aiming */
    if (ps->aiming && (ps->realFrame & 1))
        return;
    if (ps->phase == PP_DEAD) {
        for (int i = 0; i < NUM_ACTORS; i++) {
            Actor *a = &ps->a[i];
            a->x += a->vx;
            a->y += a->vy;
            brake(a);
        }
        if (ps->deadTimer)
            ps->deadTimer--;
        if (!ps->deadTimer)
            ps->phase = PP_DONE;
        goto anim;
    }
    ps->frame++;
    if (ps->juke)
        ps->juke--;
    if (ps->stiff)
        ps->stiff--;
    if (ps->jukeCool)
        ps->jukeCool--;
    if (ps->stiffCool)
        ps->stiffCool--;
    if (ps->throwFrame && ps->throwFrame < 20)
        ps->throwFrame++;
    record_history(ps);
    update_handoff(ps);
    for (int i = 0; i < NUM_ACTORS; i++)
        update_actor(ps, i, held);
    for (int i = 0; i < NUM_ACTORS; i++) {
        Actor *a = &ps->a[i];
        s32 sp = approx_len(a->vx, a->vy);
        s32 cap = a->maxSpd;
        if (i == ps->carrier && a->job == J_CARRIER)
            cap = cap * 94 / 100; /* carrying the ball */
        if (a->job == J_PURSUE)
            cap = cap * 116 / 100;
        if (i == ps->carrier && ps->dive)
            cap += a->maxSpd;
        if (sp > cap && sp > 0 && !(i == ps->carrier && ps->juke)) {
            a->vx = a->vx * cap / sp;
            a->vy = a->vy * cap / sp;
        }
        a->x += a->vx;
        a->y += a->vy;
        if (i != ps->carrier)
            a->y = CLAMP(a->y, -YDS(2), W + YDS(2));
    }
    separate(ps);
    update_ball(ps);
    if (ps->phase == PP_LIVE || ps->phase == PP_RUN || ps->phase == PP_HANDOFF)
        check_tackles(ps);
    check_boundaries(ps);
    if (ps->frame > 1500 && ps->phase != PP_DEAD)
        end_play(ps, OUT_TACKLE, carrier_x(ps));

anim:
    /* animation frames */
    for (int i = 0; i < NUM_ACTORS; i++) {
        Actor *a = &ps->a[i];
        s32 sp = approx_len(a->vx, a->vy);
        if (a->vx > 40)
            a->flip = 0;
        else if (a->vx < -40)
            a->flip = 1;
        if (a->down || a->stun) {
            a->frame = (i == ps->carrier && ps->out.diving) ? FR_DIVE : FR_DOWN;
            continue;
        }
        if (ps->celebrate && i == ps->out.carrier) {
            a->frame = FR_CATCH;
            continue;
        }
        if (i == ps->carrier && ps->dive) {
            a->frame = FR_DIVE;
            continue;
        }
        if (a->engaged >= 0) {
            a->frame = FR_BLOCK;
            continue;
        }
        if (i == A_QB && ps->throwFrame && ps->throwFrame < 14) {
            a->frame = FR_THROW;
            continue;
        }
        if (i == A_QB && ps->aiming) {
            a->frame = FR_THROW;
            continue;
        }
        if (ps->ball.state == BALL_AIR && i == ps->ball.intended && ps->ball.T - ps->ball.t < 10) {
            a->frame = FR_CATCH;
            continue;
        }
        if (sp > 60) {
            a->anim = (u8)(a->anim + 1 + (sp > 500));
            a->frame = ((a->anim >> 3) & 1) ? FR_RUN2 : FR_RUN1;
        } else {
            a->frame = (ps->phase == PP_PRESNAP && (i >= A_OL1 && i <= A_DL3)) ? FR_BLOCK : FR_STAND;
        }
    }
}

int play_done(const PlayState *ps)
{
    return ps->phase == PP_DONE;
}

/* ------------------------------------------------------------------ */
/* autopilot (tests / attract mode)                                    */
/* ------------------------------------------------------------------ */

void play_autopilot(PlayState *ps, u16 *held, u16 *pressed, u16 *released)
{
    static u16 prevHeld;
    u16 h = 0;
    if (ps->phase == PP_LIVE && ps->carrier == A_QB && !ps->crossedLOS &&
        (ps->play->kind == PK_PASS || ps->play->kind == PK_SCREEN ||
         (ps->play->kind == PK_PLAY_ACTION && ps->a[A_RB].job != J_HANDOFF))) {
        if (ps->aiming) {
            if (ps->power < 55)
                h |= KEY_A;
        } else if (ps->frame > 34) {
            /* pick the most open receiver */
            s8 el[4];
            int n = play_eligible(ps, el);
            int best = el[0];
            s32 bsep = -1;
            for (int k = 0; k < n; k++) {
                const Actor *r = &ps->a[el[k]];
                s32 sep = YDS(99);
                for (int i = NUM_OFF; i < NUM_ACTORS; i++)
                    sep = MIN(sep, dist_aa(r, &ps->a[i]));
                if (sep > bsep) {
                    bsep = sep;
                    best = el[k];
                }
            }
            ps->sel = (s8)best;
            if (bsep > YDS(2) || ps->frame > 90)
                h |= KEY_A;
        }
    } else if (ps->carrier >= 0 && ps->carrier == ps->user) {
        h |= KEY_RIGHT;
        const Actor *c = &ps->a[ps->carrier];
        if (c->y < YDS(8))
            h |= KEY_DOWN;
        else if (c->y > W - YDS(8))
            h |= KEY_UP;
    }
    *held = h;
    *pressed = (u16)(h & ~prevHeld);
    *released = (u16)(~h & prevHeld);
    prevHeld = h;
}
