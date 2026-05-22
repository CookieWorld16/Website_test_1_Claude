# CLAUDE.md

## Reference Architecture: ClubLink

This project follows the same architecture as ClubLink (INFO310 S1 2026).
Use ClubLink as the reference implementation when suggesting patterns, file structure, and conventions.

## Tech Stack

- **Frontend:** Vue 3 + Vite, Vue Router 4, raw CSS (no framework)
- **Backend:** Node.js + Express, Supabase JS client, CORS, dotenv
- **Database:** Supabase (PostgreSQL)
- **Auth:** Custom session stored in `localStorage` — manual username/password check against a DB table (not Supabase Auth)

## Project Structure