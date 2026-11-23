

/* ==== CodeLeague harness (generated, do not edit) ==== */
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *cl_data = NULL;
static size_t cl_len = 0, cl_pos = 0;

static void cl_die(const char *msg) {
    fputs(msg, stderr);
    fputc('\n', stderr);
    exit(3);
}

static void cl_load(void) {
    size_t cap = 1 << 16, n;
    cl_data = (char *)malloc(cap + 1);
    if (!cl_data) cl_die("harness: out of memory");
    while ((n = fread(cl_data + cl_len, 1, cap - cl_len, stdin)) > 0) {
        cl_len += n;
        if (cl_len == cap) {
            char *p;
            cap *= 2;
            p = (char *)realloc(cl_data, cap + 1);
            if (!p) cl_die("harness: out of memory");
            cl_data = p;
        }
    }
    cl_data[cl_len] = '\0';
}

static int cl_is_space(char c) { return c == ' ' || c == '\n' || c == '\r' || c == '\t'; }

static char *cl_tok(void) {
    char *start;
    while (cl_pos < cl_len && cl_is_space(cl_data[cl_pos])) cl_pos++;
    if (cl_pos >= cl_len) cl_die("harness: unexpected end of input");
    start = cl_data + cl_pos;
    while (cl_pos < cl_len && !cl_is_space(cl_data[cl_pos])) cl_pos++;
    cl_data[cl_pos] = '\0';
    if (cl_pos < cl_len) cl_pos++;
    return start;
}

static int cl_hex(char c) { return c <= '9' ? c - '0' : (c | 32) - 'a' + 10; }

static int cl_read_int(void) { return (int)strtol(cl_tok(), NULL, 10); }
static long long cl_read_long(void) { return strtoll(cl_tok(), NULL, 10); }
static double cl_read_double(void) { return strtod(cl_tok(), NULL); }
static bool cl_read_bool(void) { return cl_tok()[0] == '1'; }
static char *cl_read_str(void) {
    char *t = cl_tok();
    size_t i, n = strlen(t) / 2;
    char *s = (char *)malloc(n + 1);
    if (!s) cl_die("harness: out of memory");
    if (t[0] == '-') n = 0;
    for (i = 0; i < n; i++) s[i] = (char)(cl_hex(t[2 * i]) * 16 + cl_hex(t[2 * i + 1]));
    s[n] = '\0';
    return s;
}

#define CL_ALLOC(T, n) ((T *)malloc(sizeof(T) * ((size_t)((n) > 0 ? (n) : 1))))

#define CL_DEFINE_READ(NAME, CT)                                             \
    static CT *cl_read_##NAME##_1(int *n) {                                  \
        int i;                                                               \
        CT *p;                                                               \
        *n = (int)cl_read_long();                                            \
        p = CL_ALLOC(CT, *n);                                                \
        if (!p) cl_die("harness: out of memory");                            \
        for (i = 0; i < *n; i++) p[i] = cl_read_##NAME();                    \
        return p;                                                            \
    }                                                                        \
    static CT **cl_read_##NAME##_2(int *n, int **cols) {                     \
        int i;                                                               \
        CT **p;                                                              \
        *n = (int)cl_read_long();                                            \
        p = CL_ALLOC(CT *, *n);                                              \
        *cols = CL_ALLOC(int, *n);                                           \
        if (!p || !*cols) cl_die("harness: out of memory");                  \
        for (i = 0; i < *n; i++) p[i] = cl_read_##NAME##_1(&(*cols)[i]);     \
        return p;                                                            \
    }

CL_DEFINE_READ(int, int)
CL_DEFINE_READ(long, long long)
CL_DEFINE_READ(double, double)
CL_DEFINE_READ(bool, bool)
CL_DEFINE_READ(str, char *)

static void cl_write_int(int v) { printf("%d", v); }
static void cl_write_long(long long v) { printf("%lld", v); }
static void cl_write_double(double v) { printf("%.17g", v); }
static void cl_write_bool(bool v) { fputc(v ? '1' : '0', stdout); }
static void cl_write_str(const char *s) {
    static const char H[] = "0123456789abcdef";
    if (!s || !*s) {
        fputc('-', stdout);
        return;
    }
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        fputc(H[c >> 4], stdout);
        fputc(H[c & 15], stdout);
    }
}

#define CL_DEFINE_WRITE(NAME, CT)                                            \
    static void cl_write_##NAME##_1(CT *p, int n) {                          \
        int i;                                                               \
        printf("%d", n);                                                     \
        for (i = 0; i < n; i++) {                                            \
            fputc(' ', stdout);                                              \
            cl_write_##NAME(p[i]);                                           \
        }                                                                    \
    }                                                                        \
    static void cl_write_##NAME##_2(CT **p, int n, int *cols) {              \
        int i;                                                               \
        printf("%d", n);                                                     \
        for (i = 0; i < n; i++) {                                            \
            fputc(' ', stdout);                                              \
            cl_write_##NAME##_1(p[i], cols[i]);                              \
        }                                                                    \
    }

CL_DEFINE_WRITE(int, int)
CL_DEFINE_WRITE(long, long long)
CL_DEFINE_WRITE(double, double)
CL_DEFINE_WRITE(bool, bool)
CL_DEFINE_WRITE(str, char *)

static void cl_begin_result(void) { fputs("\n@@CL_RESULT@@\n", stdout); }
static void cl_end_result(void) {
    fputc('\n', stdout);
    fflush(stdout);
}
