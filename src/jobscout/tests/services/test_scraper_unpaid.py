"""UNPAID: internship posts that pay nothing are spotted; paid ones are kept.
The descriptions are cut from real posts the scraper saved."""
from jobhunt.services.scraper.unpaid import is_unpaid_internship

INTERN = "Full Stack Developer Intern"


def test_says_unpaid_or_asks_for_a_fee():
    assert is_unpaid_internship(INTERN, "Mode: Remote * Compensation: Unpaid * Career Opportunity")
    assert is_unpaid_internship(INTERN, "Employment type: Internship (unpaid)")
    assert is_unpaid_internship(INTERN, "A registration fee of Rs 999 applies.")
    assert is_unpaid_internship(INTERN, "Stipend: Nil. Learn MERN.")


def test_certificate_only_is_unpaid():
    assert is_unpaid_internship("Database Developer Intern",
                                "Duration 3 - 6 Months Certificate will be provided")


def test_performance_only_stipend_is_unpaid():
    assert is_unpaid_internship("MERN STACK DEVELOPMENT INTERN",
                                "PERKS & BENEFITS • Internship Certificate • Letter of Recommendation "
                                "• Performance-Based Stipend up to ₹15000/- EQUAL OPPORTUNITY")
    assert is_unpaid_internship(INTERN, "Duration: 3 Months Stipend: Up to ₹10,000 (Performance-Based)")
    assert is_unpaid_internship(INTERN, "3 months and a performance-based stipend of up to ₹10,000.")


def test_fixed_stipend_is_paid_even_with_a_certificate():
    assert not is_unpaid_internship(INTERN, "Certificate of Completion. Pay: ₹2,000.00 - ₹10,000.00 per month")
    assert not is_unpaid_internship(INTERN, "Stipend: ₹14,000 – ₹15,000 per month • Internship certificate")
    assert not is_unpaid_internship(INTERN, "a 3-month, paid internship. Monthly stipend of ₹32,000")


def test_full_time_jobs_and_empty_descriptions_are_never_dropped():
    assert not is_unpaid_internship("Software Engineer", "Certificate in AWS is a plus. Unpaid overtime: never.")
    assert not is_unpaid_internship(INTERN, "")
    # Indeed marks the job type, so an internship without "intern" in the title still counts
    assert is_unpaid_internship("Software Developer", "Certificate on completion", job_type="internship")
