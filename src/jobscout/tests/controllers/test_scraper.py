"""CONTROLLER: the whole `start:scraper` flow with fake sites."""
from jobhunt.controllers import scraper as controller
from jobhunt.services.scraper import sources
from jobhunt.models.scraped_row import _to_job
from jobhunt.repositories.scraper_csv import _read


def test_job_pages_load_only_for_jobs_that_pass(tmp_path, monkeypatch):
    cards = [{"id": "li-1", "title": "Software Engineer Intern", "company": "Acme",
              "location": "Pune, India", "job_url": "https://li/1"},
             {"id": "li-2", "title": "Senior Sales Manager", "company": "Beta",
              "location": "Pune, India", "job_url": "https://li/2"},
             {"id": "li-3", "title": "Backend Developer", "company": "Gamma",
              "location": "Pune, India", "job_url": "https://li/3"}]
    seen_cfg, opened = {}, []

    def fake_search(site, term, cfg):
        seen_cfg["fetch"] = sources.two_pass(site, cfg)
        return [(_to_job(site, c), c) for c in cards]

    def fake_fetcher(site, cfg):
        def fetch(job_id):
            opened.append(job_id)
            text = "Freshers welcome." if job_id == "li-1" else "Needs 4+ years of experience."
            return {"description": text, "job_level": "entry level"}
        return fetch

    monkeypatch.setattr(controller, "search", fake_search)
    monkeypatch.setattr(sources, "detail_fetcher", fake_fetcher)
    monkeypatch.setattr(controller.time, "sleep", lambda s: None)
    monkeypatch.setenv("SCRAPER_OUTPUT_DIR", str(tmp_path))
    cfg = {"scraper": {"sites": ["linkedin"], "search_terms": ["sde"], "pause_seconds": 0}}
    filters = {"include_titles": [r"\b(engineer|developer)\b", r"\bintern\b"],
               "exclude_titles": [r"\bsales\b"], "locations": ["pune", "india"],
               "max_experience_years": 1}
    assert controller.run(cfg, filters) == 0
    assert seen_cfg["fetch"] is True
    assert opened == ["li-1", "li-3"]             # the sales job was never opened
    rows = _read(tmp_path / "linkedin_jobs.csv")
    assert [r["Role"] for r in rows] == ["Software Engineer Intern"]   # 4+ years dropped
    assert rows[0]["Description"] == "Freshers welcome." and rows[0]["Job Level"] == "Entry level"


def _run_with(monkeypatch, tmp_path, cards, cfg_extra=None, **run_kwargs):
    asked = {}

    def fake_search(site, term, cfg):
        asked[site] = sources.results_wanted(site, cfg)
        return [(_to_job(site, c), c) for c in cards]

    monkeypatch.setattr(controller, "search", fake_search)
    monkeypatch.setattr(sources, "detail_fetcher", lambda site, cfg: lambda job_id: {})  # offline
    monkeypatch.setattr(controller.time, "sleep", lambda s: None)
    monkeypatch.setenv("SCRAPER_OUTPUT_DIR", str(tmp_path))
    cfg = {"scraper": {"sites": ["indeed"], "search_terms": ["sde"], "pause_seconds": 0,
                       "results_wanted": 25, "linkedin_results_wanted": 20, **(cfg_extra or {})}}
    filters = {"include_titles": [r"\b(engineer|developer)\b", r"\bintern\b"], "locations": ["india"]}
    assert controller.run(cfg, filters, **run_kwargs) == 0
    return asked, [r["Company"] for r in _read(tmp_path / "indeed_jobs.csv")]


INTERN_CARDS = [
    {"id": "in-1", "title": "Full Stack Developer Intern", "company": "Paid Co", "location": "Pune, India",
     "job_url": "https://in/1", "description": "Stipend: ₹15,000 per month. Certificate on completion."},
    {"id": "in-2", "title": "MERN Stack Development Intern", "company": "Perks Only", "location": "India",
     "job_url": "https://in/2", "description": "Perks: Internship Certificate, Letter of Recommendation"},
]


def test_unpaid_internships_are_not_saved(tmp_path, monkeypatch):
    _, saved = _run_with(monkeypatch, tmp_path, INTERN_CARDS)
    assert saved == ["Paid Co"]


def test_unpaid_filter_can_be_turned_off(tmp_path, monkeypatch):
    _, saved = _run_with(monkeypatch, tmp_path, INTERN_CARDS, {"drop_unpaid_internships": False})
    assert saved == ["Paid Co", "Perks Only"]


def test_results_per_site_and_the_results_flag(tmp_path, monkeypatch):
    asked, _ = _run_with(monkeypatch, tmp_path, INTERN_CARDS, {"sites": ["linkedin", "indeed"]})
    assert asked == {"linkedin": 20, "indeed": 25}
    asked, _ = _run_with(monkeypatch, tmp_path / "flag", INTERN_CARDS, {"sites": ["linkedin", "indeed"]},
                         results=5)
    assert asked == {"linkedin": 5, "indeed": 5}


def test_a_failed_search_is_reported_once_and_the_run_goes_on(tmp_path, monkeypatch, capsys):
    calls = []

    def flaky_search(site, term, cfg):
        calls.append(term)
        return None if term == "blocked" else [(_to_job(site, c), c) for c in INTERN_CARDS[:1]]

    monkeypatch.setattr(controller, "search", flaky_search)
    monkeypatch.setattr(controller.time, "sleep", lambda s: None)
    monkeypatch.setenv("SCRAPER_OUTPUT_DIR", str(tmp_path))
    cfg = {"scraper": {"sites": ["indeed"], "search_terms": ["blocked", "sde"], "pause_seconds": 0}}
    assert controller.run(cfg, {"include_titles": [r"\bintern\b"], "locations": ["india"]}) == 0
    out = capsys.readouterr().out
    assert calls == ["blocked", "sde"]
    assert "nothing found" not in out                       # a failure is not "0 results"
    assert "1 found" in out and "Total" in out
    logs = list((tmp_path / "logs").glob("*.log"))
    assert len(logs) == 1 and "▸ Indeed" in logs[0].read_text(encoding="utf-8")
