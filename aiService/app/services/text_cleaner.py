# app/services/text_cleaner.py
from __future__ import annotations

import contextlib
import io
import logging
import re
from functools import lru_cache
from typing import List

import nltk
import zeyrek

log = logging.getLogger(__name__)

_WORD_RE = re.compile(r"\b[a-zA-ZçÇğĞıİöÖşŞüÜ]+\b")


@contextlib.contextmanager
def _suppress_output():
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        yield


def _ensure_nltk():
    # Bazı ortamlarda "punkt" yeterli, bazılarında "punkt_tab" arıyor.
    # Sessizce dener, yoksa indirir.
    try:
        nltk.data.find("tokenizers/punkt")
    except LookupError:
        with _suppress_output():
            nltk.download("punkt")

    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        with _suppress_output():
            nltk.download("punkt_tab")


@lru_cache(maxsize=1)
def _get_analyzer() -> zeyrek.MorphAnalyzer:
    _ensure_nltk()
    # Zeyrek init ve analiz sırasında stdout basabiliyor, bunu bastırıyoruz.
    with _suppress_output():
        return zeyrek.MorphAnalyzer()


def detect_unknown_words(text: str) -> List[str]:
    """
    Zeyrek'in analiz edemediği kelimeleri "şüpheli" diye döndürür.
    """
    if not text or not text.strip():
        return []

    analyzer = _get_analyzer()
    words = _WORD_RE.findall(text)

    unknown = set()
    for w in words:
        if len(w) < 2:
            continue
        with _suppress_output():
            results = analyzer.analyze(w.lower())
        if not results:
            unknown.add(w)

    return sorted(unknown)
