/* crackme.c — W4-T05 authorized RE fixture (self-built: authorization inherent).
 * No network, no filesystem, no system calls beyond stdio.
 * Credential is XOR 0x5a obfuscated (11 bytes) — strings will NOT reveal it;
 * the solver must locate the compare routine and decode it.
 */
#include <stdio.h>
#include <string.h>

static int check(const char *s) {
	static const unsigned char enc[] = {
		0x32, 0x3f, 0x36, 0x37, 0x21, 0x28, 0x3f, 0x05, 0x35, 0x31, 0x27
	}; /* "helm{re_ok}" ^ 0x5a */
	size_t n = sizeof(enc);
	if (strlen(s) != n) return 0;
	for (size_t i = 0; i < n; i++) {
		if (((unsigned char)s[i] ^ 0x5a) != enc[i]) return 0;
	}
	return 1;
}

int main(void) {
	char buf[64];
	printf("crackme-1: enter credential: ");
	if (!fgets(buf, sizeof(buf), stdin)) return 1;
	buf[strcspn(buf, "\n")] = 0;
	if (check(buf)) {
		printf("ACCESS GRANTED\n");
		return 0;
	}
	printf("denied\n");
	return 2;
}
