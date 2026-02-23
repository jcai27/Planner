"""init tables

Revision ID: 20260222_0001
Revises:
Create Date: 2026-02-22 16:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260222_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("destination", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("accommodation_lat", sa.Float(), nullable=False),
        sa.Column("accommodation_lng", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_trips_id"), "trips", ["id"], unique=False)

    op.create_table(
        "participants",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("trip_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("interest_vector", sa.JSON(), nullable=False),
        sa.Column("schedule_preference", sa.String(), nullable=False),
        sa.Column("wake_preference", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_participants_trip_id"), "participants", ["trip_id"], unique=False)

    op.create_table(
        "itineraries",
        sa.Column("trip_id", sa.String(), nullable=False),
        sa.Column("generated_at", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("trip_id"),
    )


def downgrade() -> None:
    op.drop_table("itineraries")
    op.drop_index(op.f("ix_participants_trip_id"), table_name="participants")
    op.drop_table("participants")
    op.drop_index(op.f("ix_trips_id"), table_name="trips")
    op.drop_table("trips")
