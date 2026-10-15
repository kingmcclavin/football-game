#include "sound.h"
#include "gba.h"
#include "gen_assets.h"

/* ---------------------------------------------------------------- */
/* note helpers (MIDI numbers)                                       */
/* ---------------------------------------------------------------- */
#define R 0
#define C3 48
#define D3 50
#define E3 52
#define F3 53
#define G3 55
#define A3 57
#define B3 59
#define C4 60
#define D4 62
#define E4 64
#define F4 65
#define FS4 66
#define G4 67
#define A4 69
#define BB4 70
#define B4 71
#define C5 72
#define D5 74
#define E5 76
#define F5 77
#define G5 79
#define A5 81
#define B5 83
#define C6 84
#define D6 86
#define E6 88
#define G6 91
#define A6 93
#define B6 95
#define C7 96
#define F2 41
#define G2 43
#define A2 45
#define BB2 46
#define B2 47
#define END 0xFF

/* ---------------------------------------------------------------- */
/* effects                                                           */
/* ---------------------------------------------------------------- */
typedef struct {
    u8 ch;     /* 2 = square, 4 = noise, 0 = end */
    u8 frames;
    u8 note;   /* MIDI note (square) or noise polynomial (noise) */
    u8 env;    /* volume<<4 | step (bit3 = increase) */
} SfxStep;

static const SfxStep sfx_move[] = {{2, 3, C6, 0x91}, {0, 0, 0, 0}};
static const SfxStep sfx_ok[] = {{2, 3, E6, 0xA1}, {2, 6, A6, 0xA2}, {0, 0, 0, 0}};
static const SfxStep sfx_back[] = {{2, 3, A5, 0xA1}, {2, 5, E5, 0xA2}, {0, 0, 0, 0}};
static const SfxStep sfx_error[] = {{2, 10, C4, 0xC3}, {0, 0, 0, 0}};
static const SfxStep sfx_snap[] = {{4, 5, 0x42, 0xC1}, {0, 0, 0, 0}};
static const SfxStep sfx_throw[] = {{2, 2, G5, 0xB1}, {2, 2, B5, 0xB1}, {2, 4, D6, 0xA2}, {0, 0, 0, 0}};
static const SfxStep sfx_catch[] = {{2, 2, C6, 0xC1}, {2, 6, G6, 0xB2}, {0, 0, 0, 0}};
static const SfxStep sfx_tackle[] = {{4, 10, 0x71, 0xF2}, {0, 0, 0, 0}};
static const SfxStep sfx_whistle[] = {
    {2, 3, A6, 0xB0}, {2, 3, B6, 0xB0}, {2, 3, A6, 0xB0}, {2, 3, B6, 0xB0},
    {2, 3, A6, 0xB0}, {2, 6, B6, 0xA2}, {0, 0, 0, 0}};
static const SfxStep sfx_firstdown[] = {{2, 4, C6, 0xB0}, {2, 4, E6, 0xB0}, {2, 10, G6, 0xB3}, {0, 0, 0, 0}};
static const SfxStep sfx_touchdown[] = {
    {2, 5, C6, 0xC0}, {2, 5, E6, 0xC0}, {2, 5, G6, 0xC0}, {2, 8, C7, 0xC0},
    {2, 5, G6, 0xC0}, {2, 16, C7, 0xC4}, {4, 40, 0x53, 0x87}, {0, 0, 0, 0}};
static const SfxStep sfx_kick[] = {{4, 4, 0x61, 0xF1}, {2, 6, G4, 0x92}, {0, 0, 0, 0}};
static const SfxStep sfx_good[] = {{2, 5, G5, 0xB0}, {2, 5, C6, 0xB0}, {2, 12, E6, 0xB3}, {4, 30, 0x53, 0x76}, {0, 0, 0, 0}};
static const SfxStep sfx_miss[] = {{2, 7, E5, 0xA0}, {2, 7, C5, 0xA0}, {2, 16, A4, 0xA4}, {0, 0, 0, 0}};
static const SfxStep sfx_turnover[] = {{2, 5, C6, 0xB0}, {2, 5, A5, 0xB0}, {2, 5, F5, 0xB0}, {2, 12, D5, 0xB3}, {0, 0, 0, 0}};
static const SfxStep sfx_crowd[] = {{4, 50, 0x54, 0x96}, {0, 0, 0, 0}};
static const SfxStep sfx_juke[] = {{2, 2, E6, 0xA1}, {2, 3, B5, 0xA1}, {0, 0, 0, 0}};
static const SfxStep sfx_coin[] = {{2, 3, B5, 0xB1}, {2, 8, E6, 0xB3}, {0, 0, 0, 0}};

static const SfxStep *const sfx_table[NUM_SFX] = {
    sfx_move, sfx_ok, sfx_back, sfx_error, sfx_snap, sfx_throw, sfx_catch,
    sfx_tackle, sfx_whistle, sfx_firstdown, sfx_touchdown, sfx_kick, sfx_good,
    sfx_miss, sfx_turnover, sfx_crowd, sfx_juke, sfx_coin,
};

/* ---------------------------------------------------------------- */
/* music (note, ticks) pairs; 1 tick = 6 frames                      */
/* ---------------------------------------------------------------- */
static const u8 title_mel[] = {
    C5, 4, E5, 2, G5, 2, C6, 4, G5, 4,
    A5, 4, F5, 2, A5, 2, C6, 6, R, 2,
    G5, 4, E5, 2, G5, 2, B5, 4, G5, 4,
    F5, 2, E5, 2, D5, 2, E5, 2, C5, 8,
    E5, 2, E5, 2, F5, 2, G5, 2, A5, 4, G5, 4,
    F5, 2, F5, 2, E5, 2, D5, 2, E5, 4, C5, 4,
    D5, 2, E5, 2, F5, 2, D5, 2, G5, 4, B4, 4,
    C5, 4, G4, 2, C5, 2, C5, 8,
    END};
static const u8 title_bass[] = {
    C3, 4, G3, 4, C3, 4, G3, 4,
    F2, 4, C3, 4, F2, 4, C3, 4,
    C3, 4, G3, 4, C3, 4, G3, 4,
    G2, 4, G2, 4, C3, 8,
    A2, 4, E3, 4, A2, 4, E3, 4,
    D3, 4, A2, 4, G2, 4, C3, 4,
    G2, 4, D3, 4, G2, 4, B2, 4,
    C3, 4, G2, 4, C3, 8,
    END};
static const u8 hub_mel[] = {
    A4, 4, C5, 4, F5, 4, E5, 4,
    D5, 4, C5, 4, A4, 8,
    G4, 4, A4, 4, BB4, 4, D5, 4,
    C5, 12, R, 4,
    A4, 4, C5, 4, F5, 4, A5, 4,
    G5, 4, F5, 4, D5, 8,
    C5, 4, D5, 4, E5, 4, G5, 4,
    F5, 12, R, 4,
    END};
static const u8 hub_bass[] = {
    F2, 8, C3, 8, BB2, 8, F2, 8, C3, 8, G2, 8, C3, 8, C3, 8,
    F2, 8, A2, 8, BB2, 8, BB2, 8, C3, 8, C3, 8, F2, 16,
    END};
static const u8 victory_mel[] = {C5, 2, E5, 2, G5, 2, C6, 6, G5, 2, C6, 10, R, 8, END};
static const u8 victory_bass[] = {C3, 4, G3, 4, C3, 8, C3, 12, END};
static const u8 defeat_mel[] = {G4, 4, FS4, 4, F4, 4, E4, 14, R, 8, END};
static const u8 defeat_bass[] = {C3, 8, B2, 8, BB2, 12, END};
static const u8 champ_mel[] = {
    G4, 2, C5, 2, E5, 2, G5, 4, E5, 2, G5, 6,
    A5, 2, G5, 2, F5, 2, E5, 2, D5, 2, E5, 2, C5, 4,
    G5, 2, G5, 2, A5, 2, B5, 2, C6, 12, R, 8,
    END};
static const u8 champ_bass[] = {C3, 8, G2, 8, F2, 8, G2, 8, C3, 8, G2, 4, C3, 12, END};

typedef struct {
    const u8 *mel, *bass;
    u8 loop;
    u8 tick;
} Song;

static const Song songs[NUM_MUS] = {
    {0, 0, 0, 6},
    {title_mel, title_bass, 1, 6},
    {hub_mel, hub_bass, 1, 8},
    {victory_mel, victory_bass, 0, 6},
    {defeat_mel, defeat_bass, 0, 7},
    {champ_mel, champ_bass, 0, 6},
};

static const SfxStep *s_sfx[2]; /* [0] square ch2, [1] noise ch4 */
static u8 s_sfxLeft[2];
static int s_song;
static const u8 *s_mp, *s_bp;
static int s_mLeft, s_bLeft;
static int s_enabled = 1;

static const u8 bass_wave[16] = {
    0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
    0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10,
};

void snd_init(void)
{
    REG_SOUNDCNT_X = 0x0080;
    REG_SOUNDCNT_L = 0xFF77;
    REG_SOUNDCNT_H = 0x0002;
    REG_SOUND1CNT_L = 0x0008;
    /* load the bass waveform into bank 0 */
    REG_SOUND3CNT_L = 0x0040;
    const u32 *w = (const u32 *)bass_wave;
    for (int i = 0; i < 4; i++)
        REG_WAVE_RAM[i] = w[i];
    REG_SOUND3CNT_L = 0x0080;
    REG_SOUND3CNT_H = 0;
}

void snd_set_enabled(int on)
{
    s_enabled = on;
    REG_SOUNDCNT_L = on ? 0xFF77 : 0x0000;
}

int snd_enabled(void)
{
    return s_enabled;
}

static void sq2(int note, int env)
{
    REG_SOUND2CNT_L = (u16)(0x0080 | ((env & 0xF0) << 8) | ((env & 0x0F) << 8));
    REG_SOUND2CNT_H = (u16)(note_rates[note] | 0x8000);
}

static void noise(int poly, int env)
{
    REG_SOUND4CNT_L = (u16)(((env & 0xF0) << 8) | ((env & 0x0F) << 8));
    REG_SOUND4CNT_H = (u16)(poly | 0x8000);
}

static void start_step(int slot)
{
    const SfxStep *st = s_sfx[slot];
    if (!st || !st->ch) {
        s_sfx[slot] = 0;
        if (slot == 0)
            REG_SOUND2CNT_L = 0;
        else
            REG_SOUND4CNT_L = 0;
        return;
    }
    s_sfxLeft[slot] = st->frames;
    if (st->ch == 2)
        sq2(st->note, st->env);
    else
        noise(st->note, st->env);
}

void snd_play(int sfx)
{
    if (!s_enabled || sfx < 0 || sfx >= NUM_SFX)
        return;
    const SfxStep *st = sfx_table[sfx];
    /* split the effect into its square and noise parts */
    int slot = st->ch == 4 ? 1 : 0;
    s_sfx[slot] = st;
    start_step(slot);
}

static void mel_note(int note)
{
    if (note == R) {
        REG_SOUND1CNT_H = 0;
        REG_SOUND1CNT_X = 0x8000;
        return;
    }
    REG_SOUND1CNT_H = (u16)(0x0080 | (0x9 << 12) | (0x3 << 8));
    REG_SOUND1CNT_X = (u16)(note_rates[note] | 0x8000);
}

static void bass_note(int note)
{
    if (note == R) {
        REG_SOUND3CNT_H = 0;
        return;
    }
    REG_SOUND3CNT_H = 0x2000;
    REG_SOUND3CNT_X = (u16)(note_rates[note] | 0x8000);
}

void music_play(int song)
{
    if (song == s_song && songs[song].loop)
        return;
    s_song = song;
    if (song <= MUS_NONE || song >= NUM_MUS) {
        music_stop();
        return;
    }
    s_mp = songs[song].mel;
    s_bp = songs[song].bass;
    s_mLeft = s_bLeft = 0;
}

void music_stop(void)
{
    s_song = MUS_NONE;
    s_mp = s_bp = 0;
    REG_SOUND1CNT_H = 0;
    REG_SOUND1CNT_X = 0x8000;
    REG_SOUND3CNT_H = 0;
}

int music_current(void)
{
    return s_song;
}

void snd_update(void)
{
    for (int slot = 0; slot < 2; slot++) {
        if (!s_sfx[slot])
            continue;
        if (s_sfxLeft[slot] && --s_sfxLeft[slot])
            continue;
        /* next step; a step on the other channel hands over */
        const SfxStep *nx = s_sfx[slot] + 1;
        if (nx->ch && (nx->ch == 4) != (slot == 1)) {
            int other = slot ^ 1;
            s_sfx[other] = nx;
            start_step(other);
            s_sfx[slot] = 0;
            if (slot == 0)
                REG_SOUND2CNT_L = 0;
            continue;
        }
        s_sfx[slot] = nx;
        start_step(slot);
    }

    if (!s_mp || !s_enabled)
        return;
    const Song *sg = &songs[s_song];
    if (s_mLeft <= 0) {
        if (*s_mp == END) {
            if (!sg->loop) {
                music_stop();
                return;
            }
            s_mp = sg->mel;
            s_bp = sg->bass;
            s_bLeft = 0;
        }
        mel_note(s_mp[0]);
        s_mLeft = s_mp[1] * sg->tick;
        s_mp += 2;
    }
    if (s_bLeft <= 0 && s_bp && *s_bp != END) {
        bass_note(s_bp[0]);
        s_bLeft = s_bp[1] * sg->tick;
        s_bp += 2;
    }
    s_mLeft--;
    s_bLeft--;
}
