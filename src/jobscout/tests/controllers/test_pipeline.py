"""cmd_run end to end with fetch, screen and the provider stubbed. No network."""
import csv
import json

from jobhunt import cli
from jobhunt.controllers import pipeline
from jobhunt.models.job import Job


class Stub:
    name = "stub"

    def __init__(self):
        self.calls = 0

    def complete(self, *args, **kwargs):
        self.calls += 1
        return '{"jd_summary": "summary", "key_skills": [], "resume_match": []}'


def test_every_job_over_the_bar_is_shown_but_only_top_n_cost_a_call(tmp_path, monkeypatch):
    (tmp_path / "profile.json").write_text("{}", encoding="utf-8")
    (tmp_path / "config.yaml").write_text(
        f"score_threshold: 7.0\nmax_per_digest: 5\n"
        f"profile_file: {(tmp_path / 'profile.json').as_posix()}\n"
        f"seen_file: {(tmp_path / 'seen.json').as_posix()}\n", encoding="utf-8")
    monkeypatch.setenv("JOBSCOUT_OUTPUT_DIR", str(tmp_path / "out"))
    monkeypatch.setenv("SCRAPER_OUTPUT_DIR", str(tmp_path / "scraper"))

    scores =[9.5, 9.0, 8.5, 8.0, 7.8, 7.5, 7.2, 7.0, 6.9, 3.0]   # 8 clear 7.0
    jobs = [Job(job_id=f"greenhouse:acme:{i}", ats="greenhouse", company="Acme",
                title=f"Software Engineer {i}", location="Bangalore",
                url=f"https://example.com/{i}", description="fresher role")
            for i in range(len(scores))]

    def fake_screen(js, *a, **k):
        for j, s in zip(js, scores):
            j.score, j.reason = s, "fits"

    stub = Stub()
    monkeypatch.setattr(pipeline, "fetch_all_mock", lambda: jobs)
    monkeypatch.setattr(pipeline, "hydrate", lambda js: None)
    monkeypatch.setattr(pipeline.llm, "screen", fake_screen)
    monkeypatch.setattr(pipeline, "resolve", lambda stage: (stub, "m"))

    assert cli.main(["--config", str(tmp_path / "config.yaml"), "run", "--mock"]) == 0

    assert stub.calls == 5                                   # summaries for the top 5 only
    doc = (tmp_path / "out" / "digest.html").read_text(encoding="utf-8")
    shown = [j for j in jobs if j.url in doc]
    assert len(shown) == 8                                   # all 7+ jobs, not just 5
    saved = list(csv.DictReader((tmp_path / "out" / "jobs.csv").open(encoding="utf-8")))
    assert len(saved) == 8
    assert len(json.loads((tmp_path / "seen.json").read_text(encoding="utf-8"))) == 10


def test_saved_scraper_jobs_are_scored_once_and_scores_written_back(tmp_path, monkeypatch):
    from jobhunt.models.scraped_row import _to_job, to_row
    from jobhunt.repositories.scraper_csv import save
    (tmp_path / "profile.json").write_text("{}", encoding="utf-8")
    (tmp_path / "companies.yaml").write_text("companies: []\n", encoding="utf-8")
    (tmp_path / "config.yaml").write_text(
        f"score_threshold: 7.0\n"
        f"companies_file: {(tmp_path / 'companies.yaml').as_posix()}\n"
        f"profile_file: {(tmp_path / 'profile.json').as_posix()}\n"
        f"seen_file: {(tmp_path / 'seen.json').as_posix()}\n", encoding="utf-8")
    out, scr = tmp_path / "out", tmp_path / "scraper"
    monkeypatch.setenv("JOBSCOUT_OUTPUT_DIR", str(out))
    monkeypatch.setenv("SCRAPER_OUTPUT_DIR", str(scr))

    raw = [{"id": f"li-{i}", "title": f"Software Engineer {i}", "company": "Acme",
            "location": "Bengaluru, India", "job_url": f"https://linkedin.com/{i}",
            "description": "fresher role"} for i in range(7)]
    scores = [9.0, 8.5, 8.0, 7.8, 7.7, 7.5, 5.0]    # 5 clear 7.7, only the best 4 are mailed
    save("linkedin", [to_row("linkedin", _to_job("linkedin", r), r, "t")
                             for r in raw], scr)

    screened = []

    def fake_screen(js, *a, **k):
        screened.extend(js)
        for j in js:
            j.score, j.reason = scores[int(j.url.rsplit("/", 1)[1])], "fits"

    stub = Stub()
    monkeypatch.setattr(pipeline, "run_batch", lambda *a, **k: ([], {}))
    monkeypatch.setattr(pipeline, "hydrate", lambda js: None)
    monkeypatch.setattr(pipeline.llm, "screen", fake_screen)
    monkeypatch.setattr(pipeline, "resolve", lambda stage: (stub, "m"))
    argv = ["--config", str(tmp_path / "config.yaml"), "run"]

    assert cli.main(argv) == 0
    assert len(screened) == 7
    doc = (out / "digest.html").read_text(encoding="utf-8")
    mailed = [f"https://linkedin.com/{i}" for i in range(4)]
    assert all(u in doc for u in mailed) and "https://linkedin.com/4" not in doc
    assert "Best from LinkedIn" in doc
    assert [r["Link"] for r in csv.DictReader((out / "jobs.csv").open(encoding="utf-8"))] == mailed
    rows = list(csv.DictReader((scr / "linkedin_jobs.csv").open(encoding="utf-8")))
    assert [r["Score"] for r in rows] == [f"{s:.1f}" for s in scores]   # every score kept

    screened.clear()
    cli.main(argv)                       # second run: nothing new to score
    assert screened == []
