# Pixel Pigskin - Game Boy Advance build
#
#   make            build build/RetroFootball.gba
#   make test       run host-side logic tests
#   make romtest    boot the ROM headlessly in mGBA and run scripted checks
#   make clean
#
# Toolchain: arm-none-eabi-gcc (devkitARM or the distro's gcc-arm-none-eabi
# with newlib). Override with  make PREFIX=/opt/devkitpro/devkitARM/bin/arm-none-eabi-

PREFIX  ?= arm-none-eabi-
CC      := $(PREFIX)gcc
OBJCOPY := $(PREFIX)objcopy
PYTHON  ?= python3

TARGET  := RetroFootball
BUILD   := build
SRC     := src

ARCH    := -mcpu=arm7tdmi -mtune=arm7tdmi -mthumb -mthumb-interwork
CFLAGS  := $(ARCH) -O2 -std=gnu11 -Wall -Wextra -Wno-unused-parameter \
           -ffunction-sections -fdata-sections -fno-strict-aliasing \
           -fstack-protector-strong \
           -I$(SRC)
ASFLAGS := -mcpu=arm7tdmi -mthumb-interwork
LDFLAGS := $(ARCH) -nostartfiles -T gba.ld -Wl,--gc-sections \
           -Wl,-Map,$(BUILD)/$(TARGET).map -Wl,--no-warn-rwx-segments
LIBS    := -lc -lgcc

CSRC := $(wildcard $(SRC)/*.c)
ifeq ($(filter $(SRC)/gen_assets.c,$(CSRC)),)
CSRC += $(SRC)/gen_assets.c
endif
OBJS := $(BUILD)/crt0.o $(patsubst $(SRC)/%.c,$(BUILD)/%.o,$(CSRC))

ASSETS := $(wildcard assets/*.txt)

all: $(BUILD)/$(TARGET).gba

$(SRC)/gen_assets.c $(SRC)/gen_assets.h: $(ASSETS) tools/gen_assets.py
	$(PYTHON) tools/gen_assets.py

$(BUILD):
	mkdir -p $(BUILD)

$(BUILD)/crt0.o: $(SRC)/crt0.s | $(BUILD)
	$(CC) $(ASFLAGS) -c $< -o $@

$(BUILD)/%.o: $(SRC)/%.c $(SRC)/gen_assets.h | $(BUILD)
	$(CC) $(CFLAGS) -MMD -c $< -o $@

$(BUILD)/$(TARGET).elf: $(OBJS) gba.ld
	$(CC) $(LDFLAGS) $(OBJS) $(LIBS) -o $@

$(BUILD)/$(TARGET).gba: $(BUILD)/$(TARGET).elf tools/gbafix.py
	$(OBJCOPY) -O binary $< $@
	$(PYTHON) tools/gbafix.py $@ --title PIXELPIGSKIN --code PXPE --maker 01

# ---- host tests ----
HOSTCC ?= gcc
LOGIC := $(SRC)/league.c $(SRC)/season.c $(SRC)/offseason.c $(SRC)/sim.c \
         $(SRC)/rules.c $(SRC)/save.c $(SRC)/rng.c $(SRC)/util.c $(SRC)/data.c \
         $(SRC)/play.c $(SRC)/playbook.c

$(BUILD)/test_logic: tests/test_logic.c $(LOGIC) | $(BUILD)
	$(HOSTCC) -DHOST_BUILD -O1 -g -Wall -Wno-format-zero-length -I$(SRC) -o $@ tests/test_logic.c $(LOGIC)

$(BUILD)/test_play: tests/test_play.c $(LOGIC) | $(BUILD)
	$(HOSTCC) -DHOST_BUILD -O1 -g -Wall -I$(SRC) -o $@ tests/test_play.c $(LOGIC)

test: $(BUILD)/test_logic $(BUILD)/test_play
	$(BUILD)/test_logic
	$(BUILD)/test_play

# ---- emulator test harness (needs libmgba-dev) ----
$(BUILD)/mgba_runner: tools/mgba_runner.c | $(BUILD)
	$(HOSTCC) -O1 -o $@ $< -lmgba

romtest: $(BUILD)/$(TARGET).gba $(BUILD)/mgba_runner
	sh tools/romtest.sh

clean:
	rm -rf $(BUILD)/*.o $(BUILD)/*.d $(BUILD)/*.elf $(BUILD)/*.map $(BUILD)/test_* $(BUILD)/mgba_runner

-include $(wildcard $(BUILD)/*.d)

.PHONY: all test romtest clean
