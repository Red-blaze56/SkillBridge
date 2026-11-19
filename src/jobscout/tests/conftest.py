"""Lets `pytest` find the jobhunt package from any test folder."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
