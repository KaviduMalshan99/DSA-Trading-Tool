"""
Who may use the app right now. Pure functions over the user's epoch-ms fields;
enforcement (REST dependency, WS middleware) comes in a later phase.

Access runs until the later of the trial end and the paid-period end. A payment
made during the trial starts at the trial end, so the plan reads "active" at once
and the trial days aren't lost.
"""
from typing import Literal, Protocol

Plan = Literal["trial", "active", "expired"]


class _HasAccessFields(Protocol):
    trial_ends_at: int | None
    subscription_ends_at: int | None


def access_until(user: _HasAccessFields) -> int:
    """Epoch ms when access ends; 0 if the user never had any."""
    return max(user.trial_ends_at or 0, user.subscription_ends_at or 0)


def plan(user: _HasAccessFields, now: int) -> Plan:
    if (user.subscription_ends_at or 0) > now:
        return "active"
    if (user.trial_ends_at or 0) > now:
        return "trial"
    return "expired"
