# FleetScore
[![tests](https://github.com/edenasharpie/S26-CPSC4910-Team21/workflows/tests/badge.svg)](https://github.com/edenasharpie/S26-CPSC4910-Team21/actions/workflows/tests.yml)
[![build](https://github.com/edenasharpie/S26-CPSC4910-Team21/workflows/build/badge.svg)](https://github.com/edenasharpie/S26-CPSC4910-Team21/actions/workflows/build.yml)
[![release](https://img.shields.io/github/v/release/edenasharpie/S26-CPSC4910-Team21?include_prereleases)](https://github.com/edenasharpie/S26-CPSC4910-Team21/releases)

## Description
FleetScore is a full-stack web application serving as a truck driver incentive and rewards platform, developed for the Spring 2026 Senior Computing Practicum course at Clemson University.

## Features

- Multiple user roles and permissions: driver, sponsor, and admin users.
- Account security features: salted SHA-256 password verification and TOTP-based password resets.
- Assumed views: admin can assume sponsor/driver view, and sponsor can assume driver view.
- Driver tools for browsing sponsor catalogs, placing orders, and tracking order history.
- Sponsor tools for fleet management, point awards/deductions, driver purchase visibility, and sponsor-scoped reporting.
- Admin tools for user/account management, catalog oversight, audit log review, invoice pages, and platform-level reporting.
- API-backed reporting with filterable report endpoints and PDF generation/export.
- Centralized audit/event logging for authentication and account activity.
- OpenAPI-documented backend endpoints.

## Technologies

### Frontend

- React
- TypeScript
- Tailwind CSS

### Backend

- Node.js with Express
- MySQL
- REST API endpoints

### Amazon Web Services
- AWS EC2 for web hosting
- AWS RDS for MySQL database storage

### AI

This project was developed with AI assistance, as permitted by the course guidelines, for the following:
- Code generation and refactoring suggestions
- Debugging and error resolution
- Generating boilerplate code

All AI-generated code was reviewed, tested, and validated by team members. Final architectural and design decisions were made by the team.

## Team
- Eden Sharp ([edenasharpie](https://github.com/edenasharpie))
- Max Haney ([mchaney-dev](https://github.com/mchaney-dev))
- Abigail Clanton ([alclanton](https://github.com/alclanton))
- Kyle Scannell ([kscannell](https://github.com/KScannell14))