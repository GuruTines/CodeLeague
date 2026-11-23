

// ==== CodeLeague harness (generated, do not edit) ====
#include <cstdio>
#include <cstdlib>
#include <string>
#include <utility>
#include <vector>

namespace cl_harness {

struct Input {
    std::string data;
    size_t pos = 0;

    Input() {
        char buf[1 << 16];
        size_t n;
        while ((n = std::fread(buf, 1, sizeof buf, stdin)) > 0) data.append(buf, n);
    }

    static bool is_space(char c) { return c == ' ' || c == '\n' || c == '\r' || c == '\t'; }

    std::string next() {
        while (pos < data.size() && is_space(data[pos])) ++pos;
        size_t start = pos;
        while (pos < data.size() && !is_space(data[pos])) ++pos;
        if (start == pos) {
            std::fputs("harness: unexpected end of input\n", stderr);
            std::exit(3);
        }
        return data.substr(start, pos - start);
    }
};

inline Input& in() {
    static Input instance;
    return instance;
}

inline int hex_digit(char c) { return c <= '9' ? c - '0' : (c | 32) - 'a' + 10; }

inline void read_value(int& v) { v = static_cast<int>(std::strtol(in().next().c_str(), nullptr, 10)); }
inline void read_value(long long& v) { v = std::strtoll(in().next().c_str(), nullptr, 10); }
inline void read_value(double& v) { v = std::strtod(in().next().c_str(), nullptr); }
inline void read_value(bool& v) { v = in().next() == "1"; }
inline void read_value(std::string& v) {
    std::string t = in().next();
    v.clear();
    if (t == "-") return;
    for (size_t i = 0; i + 1 < t.size(); i += 2)
        v.push_back(static_cast<char>(hex_digit(t[i]) * 16 + hex_digit(t[i + 1])));
}
template <class T>
void read_value(std::vector<T>& v) {
    long long n = 0;
    read_value(n);
    v.clear();
    v.reserve(static_cast<size_t>(n));
    for (long long i = 0; i < n; ++i) {
        T x{};
        read_value(x);
        v.push_back(std::move(x));
    }
}

template <class T>
T read_arg() {
    T v{};
    read_value(v);
    return v;
}

inline void write_value(std::string& o, int v) { o += std::to_string(v); }
inline void write_value(std::string& o, long long v) { o += std::to_string(v); }
inline void write_value(std::string& o, double v) {
    char b[40];
    std::snprintf(b, sizeof b, "%.17g", v);
    o += b;
}
inline void write_value(std::string& o, bool v) { o += v ? '1' : '0'; }
inline void write_value(std::string& o, const std::string& v) {
    static const char* H = "0123456789abcdef";
    if (v.empty()) {
        o += '-';
        return;
    }
    for (unsigned char c : v) {
        o += H[c >> 4];
        o += H[c & 15];
    }
}
void write_value(std::string&, const char*) = delete;  // a `const char*` result would silently become `bool`
template <class T>
void write_value(std::string& o, const std::vector<T>& v) {
    o += std::to_string(v.size());
    for (size_t i = 0; i < v.size(); ++i) {
        o += ' ';
        const auto& e = v[i];
        write_value(o, e);
    }
}

inline void emit(const std::string& out) {
    std::printf("\n@@CL_RESULT@@\n%s\n", out.c_str());
    std::fflush(stdout);
}

}  // namespace cl_harness
