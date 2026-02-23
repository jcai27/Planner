"""add trip access tokens

Revision ID: 20260223_0002
Revises: 20260222_0001
Create Date: 2026-02-23 21:30:00.000000
"""

import secrets

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260223_0002"
down_revision = "20260222_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("owner_token", sa.String(), nullable=True))
    op.add_column("trips", sa.Column("join_code", sa.String(), nullable=True))

    bind = op.get_bind()
    trip_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM trips")).fetchall()]
    for trip_id in trip_ids:
        bind.execute(
            sa.text(
                "UPDATE trips SET owner_token = :owner_token, join_code = :join_code WHERE id = :trip_id"
            ),
            {
                "owner_token": secrets.token_urlsafe(24),
                "join_code": secrets.token_hex(3).upper(),
                "trip_id": trip_id,
            },
        )

    op.alter_column("trips", "owner_token", nullable=False)
    op.alter_column("trips", "join_code", nullable=False)
    op.create_index(op.f("ix_trips_owner_token"), "trips", ["owner_token"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_trips_owner_token"), table_name="trips")
    op.drop_column("trips", "join_code")
    op.drop_column("trips", "owner_token")
