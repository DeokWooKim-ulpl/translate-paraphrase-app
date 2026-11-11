"""src/ 의 조각을 이어 app/index.html (claude.ai 아티팩트로 게시하는 파일) 하나를 만듭니다.

쓰는 법:  python3 build.py
- src/style.css   : 모양
- src/body.html   : 화면 뼈대
- src/lib.js      : 순수 함수 (차이 표시, 글 나누기, 보존 검사 …)
- src/prompts.js  : 지시문(프롬프트)과 답 파서, 용어집
- src/app.*.js    : 화면 동작 (core → side → runs → store → init 순서)
LLM 을 쓰지 않으므로 토큰이 들지 않습니다.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
JS = ["lib.js", "prompts.js", "app.core.js", "app.side.js", "app.runs.js", "app.store.js", "app.init.js"]
TITLE = "번역 및 패러프레이징 앱"
FONTS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+KR:wght@600;700&display=swap"


def read(name):
    return (SRC / name).read_text(encoding="utf-8")


def main():
    js = []
    for name in JS:
        text = read(name)
        # node 테스트용 내보내기 줄은 페이지에 필요 없으므로 뺌
        text = re.sub(r"\nif \(typeof module !== 'undefined'\) \{.*?\n\}\n", "\n", text, flags=re.S)
        if "</script" in text.lower():
            sys.exit(f"{name}: '</script' 문자열이 들어 있어 페이지가 깨집니다.")
        js.append(f"/* ---- {name} ---- */\n{text.strip()}\n")
    page = (
        f"<title>{TITLE}</title>\n"
        '<meta name="claude:viewport-fit-sides" content="cover">\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        f'<link rel="stylesheet" href="{FONTS}">\n'
        f"<style>\n{read('style.css').strip()}\n</style>\n\n"
        f"{read('body.html').strip()}\n\n"
        "<script>\n(function () {\n'use strict';\n" + "\n".join(js) + "})();\n</script>\n"
    )
    out = ROOT / "app" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print(f"built {out.relative_to(ROOT)}: {len(page.encode('utf-8')):,} bytes")


if __name__ == "__main__":
    main()
