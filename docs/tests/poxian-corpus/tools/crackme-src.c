/* Minimal crackme fixture for the poxian corpus reverse items (A21-A27).
 *
 * Exists so "the workspace binary" in those prompts has one deterministic
 * target: printable strings >8 chars (strings), a stable hash (md5sum), an ELF
 * header (file), a main symbol worth disassembling (objdump/nm), section
 * headers (readelf -S) and a build-id note (compiler hints). No real secret is
 * guarded here — this is a local enumeration fixture, authorized localhost only.
 */

#include <stdio.h>
#include <string.h>

static const char *BANNER = "CRACKME-2026 local enumeration fixture";
static const char *PROMPT_STR = "enter serial (AB-1234-ZX form): ";
static const char *FAIL_STR = "license check failed: serial mismatch";
static const char *OK_STR = "license accepted for local lab";

/* checksum transform: xor-fold of the serial under a fixed key */
static int check_serial(const char *serial) {
	if (strncmp(serial, "AB-", 3) != 0) return 0;
	int acc = 0x5a;
	for (const char *p = serial; *p; ++p) acc = ((acc * 31) ^ (unsigned char)*p) & 0xffff;
	return acc % 10000 == 6843; /* serial AB-1234-ZX folds to 26843 */
}

int main(int argc, char **argv) {
	setvbuf(stdout, NULL, _IONBF, 0);
	printf("%s\n", BANNER);
	if (argc < 2) {
		printf("%s", PROMPT_STR);
		char buf[64];
		if (!fgets(buf, sizeof buf, stdin)) return 2;
		buf[strcspn(buf, "\n")] = 0;
		argv = (char *[]){argv[0], buf, NULL};
		argc = 2;
	}
	if (check_serial(argv[1])) {
		printf("%s\n", OK_STR);
		return 0;
	}
	printf("%s\n", FAIL_STR);
	return 1;
}
