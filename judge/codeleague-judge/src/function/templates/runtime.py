

# ==== CodeLeague harness (generated, do not edit) ====
import sys as __cl_sys


def __cl_main(params, ret, fn):
    toks = __cl_sys.stdin.read().split()
    pos = 0

    def tok():
        nonlocal pos
        if pos >= len(toks):
            raise ValueError("harness: unexpected end of input")
        pos += 1
        return toks[pos - 1]

    def read(base, dims):
        nonlocal pos
        if dims:
            n = int(tok())
            if dims == 1 and (base == "int" or base == "long"):
                if pos + n > len(toks):
                    raise ValueError("harness: unexpected end of input")
                chunk = toks[pos:pos + n]
                pos += n
                return list(map(int, chunk))
            return [read(base, dims - 1) for _ in range(n)]
        t = tok()
        if base == "int" or base == "long":
            return int(t)
        if base == "double":
            return float(t)
        if base == "bool":
            return t == "1"
        return "" if t == "-" else bytes.fromhex(t).decode("utf-8")

    out = []

    def put(base, dims, v):
        if dims:
            if not isinstance(v, (list, tuple)):
                raise TypeError("expected a list, got " + type(v).__name__)
            out.append(str(len(v)))
            for x in v:
                put(base, dims - 1, x)
        elif base == "int" or base == "long":
            if isinstance(v, bool) or not isinstance(v, int):
                raise TypeError("expected an integer, got " + type(v).__name__)
            out.append(str(v))
        elif base == "double":
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise TypeError("expected a number, got " + type(v).__name__)
            out.append(repr(float(v)))
        elif base == "bool":
            if not isinstance(v, bool):
                raise TypeError("expected a bool, got " + type(v).__name__)
            out.append("1" if v else "0")
        else:
            if not isinstance(v, str):
                raise TypeError("expected a string, got " + type(v).__name__)
            b = v.encode("utf-8")
            out.append(b.hex() if b else "-")

    args = [read(base, dims) for base, dims in params]
    result = fn(*args)
    put(ret[0], ret[1], result)
    __cl_sys.stdout.write("\n@@CL_RESULT@@\n" + " ".join(out) + "\n")
    __cl_sys.stdout.flush()
