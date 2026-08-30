# Romantic Dating Invitation

A full-stack romantic dating invitation website using HTML, CSS, vanilla JavaScript, PHP 8+, MySQL and PDO.

## Setup

1. Create the database and table:

   ```sql
   SOURCE database/schema.sql;
   ```

   Or import `database/schema.sql` from phpMyAdmin.

2. Copy `.env.example` to `.env` and update credentials:

   ```ini
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=dating_invitation
   DB_USERNAME=root
   DB_PASSWORD=
   ```

3. Start the PHP server from the project root:

   ```bash
   php -S 127.0.0.1:8080
   ```

   Open `http://127.0.0.1:8080/public/index.html`.

## API Endpoints

- `POST /backend/api/start.php` saves the YES response.
- `POST /backend/api/date.php` saves selected date and time.
- `POST /backend/api/food.php` saves one allowed food option.
- `POST /backend/api/location.php` saves country, state, district and town with an approximate town coordinate.
- `POST /backend/api/matches.php` returns accepted profiles within 10 km only.
- `POST /backend/api/accept.php` saves final acceptance.
- `POST /backend/api/chat-start.php` finds a random stranger or creates a waiting room.
- `POST /backend/api/chat-status.php` checks whether a stranger has joined.
- `POST /backend/api/chat-message.php` sends a text chat message.
- `POST /backend/api/chat-messages.php` polls new text messages.
- `POST /backend/api/chat-signal.php` stores WebRTC video signals.
- `POST /backend/api/chat-signals.php` polls WebRTC video signals.
- `POST /backend/api/chat-leave.php` ends the random chat.
- `POST /backend/api/online-heartbeat.php` marks a visitor online.
- `POST /backend/api/online-stats.php` returns total, country-wise and state-wise online counts.

All endpoints return JSON, use PDO prepared statements, validate input and keep database credentials server-side.

## Location And Privacy

The location flow is cascading: country → state → district → town. The radius is fixed at 10 km. The app does not request precise GPS. It stores an approximate town coordinate and the match API only returns limited profile details after the other visitor has accepted.

## Random Chat

The final page has a `random live chat` button. It opens an Omegle-style screen with:

- A clickable online count in the top-right header.
- Country-wise and state-wise online user stats.
- Random text chat with another active visitor.
- Optional video chat using WebRTC.
- A `leave` button to end the current stranger chat.

Video chat needs camera permission and works best on `localhost` or HTTPS. For production video chat across different networks, add a TURN server; the current setup uses a public STUN server for basic peer discovery.

## Quick API Test

```bash
curl -X POST http://127.0.0.1:8080/backend/api/start.php \
  -H "Content-Type: application/json" \
  -d "{\"visitor_id\":\"dating_abc1234567\"}"
```

## Database Structure

The `date_responses` table stores visitor ID, YES response, selected date/time, food, approximate location fields, 10 km radius and final acceptance timestamps. Random chat uses `chat_rooms`, `chat_messages`, `chat_signals` and `online_users`.
