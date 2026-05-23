#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_IGNORED_TREE_PARTS = (
    ".git",
    ".venv",
    "dist",
    "node_modules",
)

DEFAULT_ALLOWED_PHRASES = (
    "README.md",
    "AGENTS.md",
    "Parent ID",
    "markdown-localization-guard",
    "owned-text-localization-guard",
    "SQLite",
    "Markdown",
    "JSON",
    "YAML",
    "XML",
    "MCP",
    "MVP",
    "GitHub",
    "OpenAI",
    "Anthropic",
    "Gemini",
    "OpenRouter",
    "CLI",
    "API",
    "HTTP",
    "SDK",
    "UI",
    "UX",
    "CSS",
    "HTML",
    "DOM",
    "URL",
    "SQL",
    "HTTPS",
    "REST",
    "GraphQL",
    "npm",
    "yarn",
    "webpack",
    "babel",
    "eslint",
    "prettier",
    "jest",
    "docker",
    "kubernetes",
    "nginx",
    "redis",
    "mongodb",
    "postgresql",
    "firebase",
    "aws",
    "gcp",
    "azure",
    "e.g.",
    "i.e.",
    "etc.",
    "vs.",
    "Dr.",
    "Mr.",
    "Mrs.",
    "Ms.",
)

DEFAULT_DOC_EXTENSIONS = (
    ".md",
    ".mdx",
    ".txt",
    ".rst",
    ".adoc",
)

DEFAULT_UI_EXTENSIONS = (
    ".html",
    ".htm",
    ".xhtml",
    ".jsx",
    ".tsx",
    ".vue",
    ".svelte",
    ".js",
    ".ts",
)

ATTRIBUTE_TEXT_PATTERN = re.compile(
    r"""(?ix)
    (?:aria-label|placeholder|title|alt|label|caption|tooltip|description|helpertext|emptytext|errortext|text|defaultMessage)
    \s*=\s*
    (?P<quote>"|'|`)
    (?P<text>.*?)
    (?P=quote)
    """
)

ICU_ID_PATTERN = re.compile(
    r"""(?ix)
    \bid
    \s*=\s*
    (?P<quote>"|'|`)
    (?P<text>.*?)
    (?P=quote)
    """
)

QUOTED_TEXT_PATTERN = re.compile(
    r"""(?sx)
    (?P<quote>"|'|`)
    (?P<text>(?:\\.|(?! (?P=quote) ).)*?)
    (?P=quote)
    """
)

TAG_TEXT_PATTERN = re.compile(r">\s*([^<>{}][^<>]{0,300}?)\s*<")

I18N_PATTERN = re.compile(
    r"""(?ix)
    (?:t|tr|\$t|i18n\.t|gettext|_)
    \s*\(\s*
    (?P<quote>['"])
    (?P<text>.*?)
    (?P=quote)
    """
)

UI_CONTEXT_TAG_MARKERS = (
    "aria-",
    "<button",
    "<label",
    "<option",
    "<a ",
    "<h1",
    "<h2",
    "<h3",
    "<h4",
    "<h5",
    "<h6",
    "<p",
    "<span",
    "<formattedmessage",
)

UI_CONTEXT_WORD_MARKERS = (
    "label",
    "title",
    "placeholder",
    "caption",
    "tooltip",
    "message",
    "toast",
    "alert",
    "dialog",
    "modal",
    "button",
    "helpertext",
    "errortext",
    "emptytext",
    "description",
    "headline",
    "subheadline",
)

UI_CONTEXT_MARKERS = UI_CONTEXT_TAG_MARKERS + UI_CONTEXT_WORD_MARKERS


GitEntries = list[tuple[str, Path]]


@dataclass(frozen=True)
class GuardConfig:
    root: Path
    ignored_tree_parts: tuple[str, ...] = DEFAULT_IGNORED_TREE_PARTS
    ignore_rel_globs: tuple[str, ...] = ()
    allowed_phrases: tuple[str, ...] = DEFAULT_ALLOWED_PHRASES
    doc_extensions: tuple[str, ...] = DEFAULT_DOC_EXTENSIONS
    ui_extensions: tuple[str, ...] = DEFAULT_UI_EXTENSIONS
    ui_context_markers: tuple[str, ...] = UI_CONTEXT_MARKERS
    max_issues_per_file: int = 10
    resolve_relative_to_root: bool = False
    since_minutes: int = 60
    strict_git: bool = False
    output_format: str = "text"
    verbose: bool = False
    dry_run: bool = False
    max_files: int = 10000
    skip_symlinks: bool = False


@dataclass(frozen=True)
class TargetFile:
    path: Path
    file_kind: str
    mode: str


def build_config(
    *,
    root: Path,
    ignored_tree_parts: Iterable[str] = DEFAULT_IGNORED_TREE_PARTS,
    ignore_rel_globs: Iterable[str] = (),
    allowed_phrases: Iterable[str] = DEFAULT_ALLOWED_PHRASES,
    doc_extensions: Iterable[str] = DEFAULT_DOC_EXTENSIONS,
    ui_extensions: Iterable[str] = DEFAULT_UI_EXTENSIONS,
    ui_context_markers: Iterable[str] = UI_CONTEXT_MARKERS,
    max_issues_per_file: int = 10,
    resolve_relative_to_root: bool = False,
    since_minutes: int = 60,
    strict_git: bool = False,
    output_format: str = "text",
    verbose: bool = False,
    dry_run: bool = False,
    max_files: int = 10000,
    skip_symlinks: bool = False,
) -> GuardConfig:
    return GuardConfig(
        root=root.resolve(),
        ignored_tree_parts=tuple(ignored_tree_parts),
        ignore_rel_globs=tuple(ignore_rel_globs),
        allowed_phrases=tuple(allowed_phrases),
        doc_extensions=tuple(ext.lower() for ext in doc_extensions),
        ui_extensions=tuple(ext.lower() for ext in ui_extensions),
        ui_context_markers=tuple(ui_context_markers),
        max_issues_per_file=max_issues_per_file,
        resolve_relative_to_root=resolve_relative_to_root,
        since_minutes=since_minutes,
        strict_git=strict_git,
        output_format=output_format,
        verbose=verbose,
        dry_run=dry_run,
        max_files=max_files,
        skip_symlinks=skip_symlinks,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="check-docs-localization",
        description=(
            "Проверяет локализацию созданных агентом документов и UI-текстов. "
            "Без путей использует ownership-aware scope по git-изменениям, "
            "а с путями проверяет указанные файлы явно."
        ),
    )
    parser.add_argument(
        "paths",
        nargs="*",
        help=(
            "Файлы или каталоги для явной проверки. "
            "Если не указаны, проверяются только созданные или добавленные агентом тексты."
        ),
    )
    parser.add_argument(
        "--root",
        default=None,
        help="Корневой каталог проверки. По умолчанию используется текущий каталог.",
    )
    parser.add_argument(
        "--allow-phrase",
        action="append",
        default=[],
        help="Дополнительная фраза, которую можно игнорировать как машинно-значимую.",
    )
    parser.add_argument(
        "--ignore-rel-glob",
        action="append",
        default=[],
        help="Дополнительный glob по пути относительно --root для игнорирования файлов.",
    )
    parser.add_argument(
        "--max-issues-per-file",
        type=int,
        default=10,
        help="Максимальное число проблемных строк, выводимых на один файл.",
    )
    parser.add_argument(
        "--resolve-relative-to-root",
        action="store_true",
        help="Разрешать относительные аргументы paths относительно --root, а не cwd.",
    )
    parser.add_argument(
        "--since-minutes",
        type=int,
        default=60,
        help="Для fallback-режима (без git): сколько минут назад считать файлы 'новыми'. По умолчанию 60.",
    )
    parser.add_argument(
        "--strict-git",
        action="store_true",
        help="Если git недоступен или не инициализирован, завершаться с ошибкой вместо fallback.",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Формат вывода: text (по умолчанию) или json.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Выводить список файлов, попавших в scope проверки.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Показать scope проверки и завершиться, не выполняя анализ.",
    )
    parser.add_argument(
        "--no-local-config",
        action="store_true",
        help="Не загружать .localization-guard.yml из корня проекта.",
    )
    parser.add_argument(
        "--max-files",
        type=int,
        default=10000,
        help="Максимальное количество файлов при рекурсивном обходе каталогов. По умолчанию 10000.",
    )
    parser.add_argument(
        "--skip-symlinks",
        action="store_true",
        help="Пропускать символические ссылки.",
    )
    return parser.parse_args(argv)


def path_from_arg(raw: str, config: GuardConfig) -> Path:
    path = Path(raw)
    if path.is_absolute():
        resolved = path.resolve()
    else:
        base = config.root if config.resolve_relative_to_root else Path.cwd()
        resolved = (base / path).resolve()
    if relative_to_root(resolved, config.root) is None:
        raise ValueError(
            f"Путь {resolved} находится за пределами корня проверки {config.root}"
        )
    return resolved


def relative_to_root(path: Path, root: Path) -> Path | None:
    try:
        return path.relative_to(root)
    except ValueError:
        return None


def matches_ignore_glob(path: Path, config: GuardConfig) -> bool:
    rel = relative_to_root(path, config.root)
    if rel is None:
        return False
    rel_text = rel.as_posix()
    return any(fnmatch.fnmatch(rel_text, pattern) for pattern in config.ignore_rel_globs)


def is_ignored_text_path(path: Path, config: GuardConfig) -> bool:
    rel = relative_to_root(path, config.root)
    if rel is not None and any(part in config.ignored_tree_parts for part in rel.parts):
        return True
    return matches_ignore_glob(path, config)


def classify_file_kind(path: Path, config: GuardConfig) -> str | None:
    suffix = path.suffix.lower()
    if suffix in config.doc_extensions:
        return "doc"
    if suffix in config.ui_extensions:
        return "ui"
    return None


def iter_supported_text_in_dir(directory: Path, config: GuardConfig) -> list[Path]:
    paths: list[Path] = []
    for path in directory.rglob("*"):
        if len(paths) >= config.max_files:
            print(
                f"Предупреждение: достигнут лимит файлов ({config.max_files}) в {directory}. "
                "Некоторые файлы могут быть пропущены.",
                file=sys.stderr,
            )
            break
        if config.skip_symlinks and path.is_symlink():
            continue
        if (
            path.is_file()
            and not is_ignored_text_path(path, config)
            and classify_file_kind(path, config) is not None
        ):
            paths.append(path)
    return sorted(paths)


def build_explicit_targets(raw_paths: Iterable[str], config: GuardConfig) -> list[TargetFile]:
    result: list[TargetFile] = []
    for raw in raw_paths:
        path = path_from_arg(raw, config)
        if path.is_dir():
            for nested_path in iter_supported_text_in_dir(path, config):
                file_kind = classify_file_kind(nested_path, config)
                if file_kind is not None:
                    result.append(TargetFile(path=nested_path, file_kind=file_kind, mode="full"))
            continue
        if path.is_file() and not is_ignored_text_path(path, config):
            file_kind = classify_file_kind(path, config)
            if file_kind is not None:
                result.append(TargetFile(path=path, file_kind=file_kind, mode="full"))
    return sorted(set(result), key=lambda item: str(item.path))


def git_status_entries(root: Path) -> list[tuple[str, Path]] | None:
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain=v1", "--untracked-files=all"],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
        )
    except (FileNotFoundError, OSError):
        return None
    if result.returncode != 0:
        return None

    entries: list[tuple[str, Path]] = []
    for raw_line in result.stdout.splitlines():
        if not raw_line:
            continue
        status = raw_line[:2]
        path_text = raw_line[3:]
        if " -> " in path_text:
            path_text = path_text.split(" -> ", 1)[1]
        entries.append((status, (root / path_text).resolve()))
    return entries


def is_new_status(status: str) -> bool:
    return status == "??" or status[0] == "A" or status[1] == "A"


def is_modified_status(status: str) -> bool:
    return status[0] in ("M", "R", "C") or status[1] in ("M", "R", "C")


def build_fallback_targets(config: GuardConfig) -> list[TargetFile]:
    import time

    cutoff = time.time() - (config.since_minutes * 60)
    targets: list[TargetFile] = []
    for path in iter_supported_text_in_dir(config.root, config):
        try:
            if path.stat().st_mtime >= cutoff:
                file_kind = classify_file_kind(path, config)
                if file_kind is not None:
                    targets.append(TargetFile(path=path, file_kind=file_kind, mode="full"))
        except OSError:
            continue
    return sorted(set(targets), key=lambda item: str(item.path))


def build_owned_targets(config: GuardConfig) -> tuple[list[TargetFile], str]:
    entries = git_status_entries(config.root)
    if entries is None:
        if config.strict_git:
            return [], "git-failure"
        return build_fallback_targets(config), "fallback"

    targets: list[TargetFile] = []
    for status, path in entries:
        if not path.exists() or is_ignored_text_path(path, config):
            continue
        file_kind = classify_file_kind(path, config)
        if file_kind is None:
            continue
        if is_new_status(status):
            targets.append(TargetFile(path=path, file_kind=file_kind, mode="full"))
            continue
        if is_modified_status(status):
            targets.append(TargetFile(path=path, file_kind=file_kind, mode="added-lines"))
    return sorted(set(targets), key=lambda item: str(item.path)), ""


def build_targets(raw_paths: Iterable[str], config: GuardConfig) -> tuple[list[TargetFile], str]:
    args = list(raw_paths)
    if args:
        return build_explicit_targets(args, config), ""
    return build_owned_targets(config)


def strip_inline_and_urls(text: str) -> str:
    text = re.sub(r"\A---\s*\n[\s\S]*?\n---\s*(?:\n|$)", "", text, count=1)
    text = re.sub(r"(?<!`)``(?!`)[^`]*(?<!`)``(?!`)", "", text)
    text = re.sub(r"`[^`\n]+`", "", text)
    text = re.sub(r"https?://\S+", "", text)
    return text


def extract_doc_lines(text: str) -> list[str]:
    lines: list[str] = []
    in_code_block = False
    code_lang: str | None = None
    plain_langs = {"", "text", "markdown", "md", "plain", "dialog", "ui"}

    for line in text.splitlines():
        m = re.match(r"^```\s*(\S+)?\s*$", line)
        if m:
            if not in_code_block:
                in_code_block = True
                code_lang = (m.group(1) or "").lower()
            else:
                in_code_block = False
                code_lang = None
            continue

        if not in_code_block:
            lines.append(line)
            continue

        if code_lang in plain_langs:
            lines.append(line)

    return lines


def normalize_line(line: str, allowed_phrases: Iterable[str]) -> str:
    clean = line
    clean = re.sub(r"\$\{[^}]+\}", "", clean)
    clean = re.sub(r"\{\{[^}]+\}\}", "", clean)
    clean = re.sub(r"\{[^}]+\}", "", clean)
    # Markdown checkbox (поддержка - / *, отступы, x/X)
    clean = re.sub(r"^\s*[-*]\s+\[[xX ]\]\s+", "", clean)
    # Многословные фразы удаляем как подстроки, однословные — только по границам слов
    for phrase in allowed_phrases:
        if " " in phrase:
            clean = re.sub(re.escape(phrase), "", clean, flags=re.IGNORECASE)
    for phrase in allowed_phrases:
        if " " not in phrase:
            clean = re.sub(rf"\b{re.escape(phrase)}\b", "", clean, flags=re.IGNORECASE)
    # Inline code (backticks) — технические литералы
    clean = re.sub(r"`[^`\n]+`", "", clean)
    # Inline markdown links
    clean = re.sub(r"\[[^\]]*\]\([^)]+\)", "", clean)
    # Reference-style markdown links [text][ref]
    clean = re.sub(r"\[[^\]]+\]\[[^\]]*\]", "", clean)
    clean = re.sub(r"[#>*_\-\[\](){}:;,.!?/\\|\"'=+]", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def has_cyrillic(text: str) -> bool:
    return bool(re.search(r"[А-Яа-яЁё]", text))


def is_machine_directive_line(text: str) -> bool:
    if re.fullmatch(r"-{3,}\s*[a-z0-9-]+\s*-{3,}", text):
        return True
    if re.fullmatch(r"[A-Z0-9_ ⟦⟧#]+", text):
        # Заглавные слова без спецсимволов, содержащие гласные — это пользовательский текст (кнопки, лейблы)
        if re.fullmatch(r"[A-Z]+", text) and any(ch in text for ch in "AEIOUY"):
            return False
        # Заголовки разделов типа "SECTION 1", "Section 1", "SECTION A" — пользовательский текст
        if re.fullmatch(r"[A-Z][A-Za-z]*[ \d.A-Z]+", text):
            return False
        return True
    return False


def latin_words(text: str) -> list[str]:
    return re.findall(r"\b[A-Za-z][A-Za-z0-9_-]*\b", text)


def is_suspicious_doc_line(line: str, allowed_phrases: Iterable[str]) -> bool:
    raw = line.strip()
    if is_machine_directive_line(raw):
        return False
    # Markdown-таблицы — структурный синтаксис, не проза.
    # Пропускаем строки, которые выглядят как строки таблицы (начинаются и заканчиваются на |),
    # но только если все ячейки содержат одиночные слова или пусты.
    # Если в ячейке есть многословная английская проза — проверяем как обычную строку.
    if re.search(r'^\s*\|.*\|\s*$', raw):
        cells = [c.strip() for c in raw.split("|") if c.strip()]
        for cell in cells:
            cell_clean = normalize_line(cell, allowed_phrases)
            words = latin_words(cell_clean)
            if len(words) >= 2:
                break
        else:
            return False
    clean = normalize_line(raw, allowed_phrases)
    if not clean or has_cyrillic(clean) or is_machine_directive_line(clean):
        return False
    words = latin_words(clean)
    if not words:
        return False
    if len(words) >= 2:
        return True
    return len(words[0]) >= 4


def suspicious_doc_lines(lines: Iterable[str], allowed_phrases: Iterable[str]) -> list[str]:
    issues: list[str] = []
    for raw_line in lines:
        if not raw_line.strip():
            continue
        if is_suspicious_doc_line(raw_line, allowed_phrases):
            issues.append(raw_line.strip())
    return issues


def ui_context_matches(raw_line: str, config: GuardConfig) -> bool:
    lower_line = raw_line.lower()
    # Разделяем маркеры на теги (подстрочное вхождение) и слова (границы слов)
    tag_markers = []
    word_markers = []
    for marker in config.ui_context_markers:
        if marker.startswith("<") or "-" in marker:
            tag_markers.append(marker.lower())
        else:
            word_markers.append(marker.lower())
    # Теги и префиксы — подстрочное вхождение
    if any(marker in lower_line for marker in tag_markers):
        return True
    # Слова-маркеры — только с границами слов, чтобы не матчить toolbutton, form-label и т.п.
    for marker in word_markers:
        if re.search(rf"\b{re.escape(marker)}\b", lower_line):
            return True
    return False


def iter_ui_fragments(raw_line: str) -> list[tuple[str, str]]:
    fragments: list[tuple[str, str]] = []
    seen: set[str] = set()

    for match in I18N_PATTERN.finditer(raw_line):
        text = match.group("text")
        if text not in seen:
            fragments.append((text, "i18n"))
            seen.add(text)

    for match in TAG_TEXT_PATTERN.finditer(raw_line):
        text = match.group(1)
        if text not in seen:
            fragments.append((text, "markup"))
            seen.add(text)

    for match in ICU_ID_PATTERN.finditer(raw_line):
        text = match.group("text")
        if text not in seen:
            fragments.append((text, "icu-id"))
            seen.add(text)

    for match in ATTRIBUTE_TEXT_PATTERN.finditer(raw_line):
        text = match.group("text")
        if text not in seen:
            fragments.append((text, "attribute"))
            seen.add(text)

    for match in QUOTED_TEXT_PATTERN.finditer(raw_line):
        text = match.group("text")
        if text not in seen:
            fragments.append((text, "quoted"))
            seen.add(text)

    return fragments


def is_suspicious_ui_fragment(
    fragment: str,
    *,
    origin: str,
    raw_line: str,
    config: GuardConfig,
) -> bool:
    stripped = fragment.strip()

    # ICU/i18n технические ключи с dot-notation (hello.world, common.save, auth.login.title)
    if origin in {"i18n", "icu-id"}:
        if re.fullmatch(r"[a-z0-9_.]+", stripped) and "." in stripped:
            return False

    if origin in {"i18n", "icu-id"}:
        if re.fullmatch(r"[a-z_][a-z0-9_]*", stripped):
            return False
        if re.fullmatch(r"[a-z][a-zA-Z0-9]+", stripped):  # camelCase
            return False
        if re.fullmatch(r"[a-z][a-z0-9-]+", stripped):     # kebab-case
            return False

    fragment_no_url = re.sub(r"https?://\S+", "", fragment.strip())
    clean = normalize_line(fragment_no_url, config.allowed_phrases)
    if not clean or has_cyrillic(clean) or is_machine_directive_line(clean):
        return False
    words = latin_words(clean)
    if not words:
        return False

    has_spaces = " " in clean
    if has_spaces:
        return True

    if origin in {"i18n", "icu-id"}:
        return any(len(word) >= 4 for word in words)

    if origin in {"markup", "attribute"}:
        return any(len(word) >= 4 for word in words)

    if not ui_context_matches(raw_line, config):
        return False

    return any(len(word) >= 4 for word in words)


def suspicious_ui_lines(lines: Iterable[str], config: GuardConfig) -> list[str]:
    issues: list[str] = []
    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue
        # Удаляем URL перед проверкой, чтобы избежать ложных срабатываний
        line_no_url = re.sub(r"https?://\S+", "", raw_line)
        for fragment, origin in iter_ui_fragments(line_no_url):
            if is_suspicious_ui_fragment(
                fragment,
                origin=origin,
                raw_line=line_no_url,
                config=config,
            ):
                issues.append(stripped)
                break
    return issues


def display_path(path: Path, root: Path) -> str:
    rel = relative_to_root(path, root)
    return rel.as_posix() if rel is not None else str(path)


def git_added_lines(path: Path, root: Path) -> list[str]:
    rel = relative_to_root(path, root)
    if rel is None:
        return []
    try:
        result = subprocess.run(
            ["git", "diff", "--no-ext-diff", "--unified=0", "--no-color", "HEAD", "--", rel.as_posix()],
            cwd=root,
            text=True,
            capture_output=True,
            check=False,
        )
    except (FileNotFoundError, OSError):
        return []
    if result.returncode not in (0, 1):
        return []

    added_lines: list[str] = []
    for raw_line in result.stdout.splitlines():
        if raw_line.startswith(("diff --git", "index ", "---", "+++", "@@")):
            continue
        if raw_line.startswith("+"):
            added_lines.append(raw_line[1:])
    return added_lines


def collect_lines_for_target(target: TargetFile, config: GuardConfig) -> list[str]:
    try:
        if target.mode == "full":
            return target.path.read_text(encoding="utf-8").splitlines()
        return git_added_lines(target.path, config.root)
    except (OSError, UnicodeDecodeError) as exc:
        print(
            f"Предупреждение: не удалось прочитать {target.path}: {exc}",
            file=sys.stderr,
        )
        return []


def evaluate_doc_target(target: TargetFile, config: GuardConfig) -> list[str]:
    if target.mode == "full":
        try:
            text = target.path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            print(
                f"Предупреждение: не удалось прочитать {target.path}: {exc}",
                file=sys.stderr,
            )
            return []
        if not text.strip():
            return []
        # Проверяем наличие кириллицы на полном тексте (до очистки), чтобы не потерять frontmatter
        full_text_has_cyrillic = has_cyrillic(text)
        text = strip_inline_and_urls(text)
        lines = extract_doc_lines(text)
        if not any(line.strip() for line in lines):
            return []
        if not full_text_has_cyrillic and not any(has_cyrillic(line) for line in lines):
            doc_issues = suspicious_doc_lines(lines, config.allowed_phrases)
            if doc_issues:
                return ["В документе не найдено русскоязычной прозы."]
            return []
        return suspicious_doc_lines(lines, config.allowed_phrases)

    return suspicious_doc_lines(collect_lines_for_target(target, config), config.allowed_phrases)


def evaluate_ui_target(target: TargetFile, config: GuardConfig) -> list[str]:
    return suspicious_ui_lines(collect_lines_for_target(target, config), config)


def _json_response(
    exit_code: int,
    scope: str,
    targets: list[TargetFile],
    failures: list[tuple[Path, list[str]]],
    message: str,
    root: Path,
) -> str:
    targets_list = [display_path(t.path, root) for t in targets]
    failures_list = [
        {"file": display_path(path, root), "issues": issues}
        for path, issues in failures
    ]
    return json.dumps(
        {
            "exit_code": exit_code,
            "scope": scope,
            "targets_checked": len(targets),
            "targets": targets_list,
            "failures": failures_list,
            "message": message,
        },
        ensure_ascii=False,
    )


def run_with_config(raw_paths: Iterable[str], config: GuardConfig) -> tuple[int, str]:
    args = list(raw_paths)
    try:
        targets, warning = build_targets(args, config)
    except ValueError as exc:
        msg = f"Ошибка: {exc}"
        if config.output_format == "json":
            return 1, _json_response(1, "explicit", [], [], msg, config.root)
        return 1, msg

    scope = "explicit" if args else ("fallback" if warning == "fallback" else "ownership-aware")

    if warning == "git-failure":
        msg = (
            "Ошибка: git недоступен или репозиторий не инициализирован. "
            "Используйте --strict-git только в git-репозитории, либо передайте пути явно."
        )
        if config.output_format == "json":
            return 1, _json_response(1, scope, [], [], msg, config.root)
        return 1, msg

    prefix = ""
    if warning == "fallback":
        prefix = (
            "Предупреждение: git недоступен или репозиторий не инициализирован. "
            f"Используется fallback: файлы, изменённые за последние {config.since_minutes} минут.\n\n"
        )

    if config.dry_run:
        target_paths = [display_path(t.path, config.root) for t in targets]
        msg = prefix + f"Dry-run: будет проверено {len(targets)} файлов."
        if config.verbose:
            msg += "\n" + "\n".join(f"  - {p}" for p in target_paths)
        if config.output_format == "json":
            return 0, _json_response(0, scope, targets, [], msg, config.root)
        return 0, msg

    if not targets:
        if args:
            msg = prefix + "Не найдено поддерживаемых документов или UI-файлов для проверки."
            code = 1
        else:
            msg = prefix + "Нет созданных агентом документов или UI-текстов для проверки."
            code = 0
        if config.output_format == "json":
            return code, _json_response(code, scope, [], [], msg, config.root)
        return code, msg

    if config.verbose:
        prefix += "Проверяемые файлы:\n" + "\n".join(
            f"  - {display_path(t.path, config.root)}" for t in targets
        ) + "\n\n"

    failures: list[tuple[Path, list[str]]] = []
    for target in targets:
        if target.file_kind == "doc":
            issues = evaluate_doc_target(target, config)
        else:
            issues = evaluate_ui_target(target, config)
        if issues:
            failures.append((target.path, issues[: config.max_issues_per_file]))

    if failures:
        lines = [prefix + "Проверка локализации не пройдена:", ""]
        for path, issues in failures:
            lines.append(f"- {display_path(path, config.root)}")
            for issue in issues:
                lines.append(f"  * {issue}")
        msg = "\n".join(lines)
        code = 2
    else:
        msg = prefix + "Проверка локализации пройдена."
        code = 0

    if config.output_format == "json":
        return code, _json_response(code, scope, targets, failures, msg, config.root)
    return code, msg


def load_local_config(root: Path) -> dict:
    config_path = root / ".localization-guard.yml"
    if not config_path.exists():
        return {}
    try:
        import yaml
    except ImportError:
        print(
            "Ошибка: найден .localization-guard.yml, но модуль PyYAML не установлен. "
            "Установите: pip install pyyaml",
            file=sys.stderr,
        )
        sys.exit(1)
    with config_path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    known_keys = {
        "allowed_phrases",
        "ignore_rel_globs",
        "doc_extensions",
        "ui_extensions",
        "ui_context_markers",
        "max_issues_per_file",
    }
    for key in data:
        if key not in known_keys:
            print(
                f"Предупреждение: неизвестный ключ '{key}' в .localization-guard.yml",
                file=sys.stderr,
            )
    return data


def main(
    argv: list[str] | None = None,
    *,
    default_root: Path | None = None,
    default_allowed_phrases: Iterable[str] = DEFAULT_ALLOWED_PHRASES,
    default_ignore_rel_globs: Iterable[str] = (),
    resolve_relative_to_root: bool = False,
) -> int:
    args = parse_args(argv)
    root = Path(args.root).resolve() if args.root else (default_root or Path.cwd()).resolve()

    local_config = load_local_config(root) if not args.no_local_config else {}

    doc_extensions = local_config.get("doc_extensions")
    ui_extensions = local_config.get("ui_extensions")
    ui_context_markers = local_config.get("ui_context_markers")

    config = build_config(
        root=root,
        ignore_rel_globs=tuple(default_ignore_rel_globs)
        + tuple(local_config.get("ignore_rel_globs", []))
        + tuple(args.ignore_rel_glob),
        allowed_phrases=tuple(default_allowed_phrases)
        + tuple(local_config.get("allowed_phrases", []))
        + tuple(args.allow_phrase),
        doc_extensions=doc_extensions if doc_extensions is not None else DEFAULT_DOC_EXTENSIONS,
        ui_extensions=ui_extensions if ui_extensions is not None else DEFAULT_UI_EXTENSIONS,
        ui_context_markers=ui_context_markers if ui_context_markers is not None else UI_CONTEXT_MARKERS,
        max_issues_per_file=local_config.get("max_issues_per_file", args.max_issues_per_file),
        resolve_relative_to_root=resolve_relative_to_root or args.resolve_relative_to_root,
        since_minutes=args.since_minutes,
        strict_git=args.strict_git,
        output_format=args.format,
        verbose=args.verbose,
        dry_run=args.dry_run,
        max_files=args.max_files,
        skip_symlinks=args.skip_symlinks,
    )
    code, output = run_with_config(args.paths, config)
    print(output)
    return code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
