/* Battery save: 32KB SRAM, two redundant copies of the Career. */
#ifndef SAVE_H
#define SAVE_H

#include "types.h"

#define SAVE_MAGIC 0x50585053u /* "SPXP" */
#define SAVE_VERSION 3
#define SAVE_SLOT_SIZE 0x4000

/* Returns 1 if a valid career save exists. */
int save_exists(void);
/* Write g_career to SRAM. Returns 1 on success (verified). */
int save_write(void);
/* Load the newest valid copy into g_career. Returns 1 on success. */
int save_load(void);
/* Erase both copies. */
void save_erase(void);

/* Low-level SRAM access (host build uses an in-memory buffer). */
void sram_write(u32 offset, const void *src, u32 len);
void sram_read(u32 offset, void *dst, u32 len);

/* Settings that live outside the career (sound on title screen). */
#endif
