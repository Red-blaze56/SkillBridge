"""DEDUP: the same job from several sites / cities is one row."""
from jobhunt.services.scraper.dedup import fingerprint, merge_duplicates, saved_fingerprints
from jobhunt.models.scraped_row import _to_job, to_row
from jobhunt.repositories.scraper_csv import save


def _row(site, company, title, location, link):
    raw = {"id": link, "title": title, "company": company, "location": location, "job_url": link}
    return to_row(site, _to_job(site, raw), raw, "t")


def test_fingerprint_ignores_case_punctuation_and_company_suffix():
    assert fingerprint("WeIntern Pvt Ltd", "Full-Stack Developer Intern") \
        == fingerprint("weintern", "Fullstack developer intern")
    assert fingerprint("Electronic Arts (EA)", "JAVA Software Engineer Intern") \
        == fingerprint("Electronic Arts", "Java Software Engineer Intern")
    assert fingerprint("Acme", "SDE") != fingerprint("Acme", "SDE Intern")


def test_same_job_on_two_sites_becomes_one_row():
    rows = [_row("glassdoor", "Etdox", "Software Engineer Intern", "", "https://gd/1"),
            _row("indeed", "Etdox", "Software Engineer Intern", "Remote, India", "https://in/1"),
            _row("indeed", "Other", "Software Engineer Intern", "Pune, India", "https://in/2")]
    merged, dropped = merge_duplicates(rows, set())
    assert dropped == 1 and len(merged) == 2
    assert merged[0]["Site"] == "glassdoor"
    assert merged[0]["Location"] == "Remote, India"
    assert merged[0]["Also On"] == "indeed: https://in/1"


def test_same_job_in_four_cities_becomes_one_row():
    rows = [_row("linkedin", "TalentRabbit", "Associate Software Engineer", city, f"https://li/{i}")
            for i, city in enumerate(["Gurugram, India", "Bengaluru, India",
                                      "Chennai, India", "Gurugram, India"])]
    merged, dropped = merge_duplicates(rows, set())
    assert dropped == 3 and len(merged) == 1
    assert merged[0]["Location"] == "Gurugram, India, Bengaluru, India, Chennai, India"
    assert merged[0]["Also On"].count("linkedin:") == 3


def test_rows_without_a_company_are_not_merged():
    rows = [_row("indeed", "", "SDE", "India", "https://in/1"),
            _row("indeed", "", "SDE", "India", "https://in/2")]
    assert len(merge_duplicates(rows, set())[0]) == 2


def test_job_already_saved_on_another_site_is_skipped(tmp_path):
    save("glassdoor", [_row("glassdoor", "Kikbak", "Front End Developer", "", "https://gd/9")],
         tmp_path)
    rows = [_row("indeed", "Kikbak", "Front End Developer",
                 "Remote, India", "https://in/9"),
            _row("indeed", "Acme", "Backend Developer", "Pune, India", "https://in/10")]
    merged, dropped = merge_duplicates(rows, saved_fingerprints(tmp_path))
    assert dropped == 1 and [r["Company"] for r in merged] == ["Acme"]
