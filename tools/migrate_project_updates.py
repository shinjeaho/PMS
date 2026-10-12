"""Add nullable save timestamps and remove the old initialization sentinel."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pms.db import create_connection
from pms.ops.migrations import migrate


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    connection = create_connection()
    if connection is None:
        raise RuntimeError('Database connection failed')
    migrate(connection)


if __name__ == '__main__':
    main()
