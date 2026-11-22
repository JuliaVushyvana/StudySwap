#!/usr/bin/env bash
# Навантаження на studyswap-api для RED-дашборду й алертів (Практика 8).
# Кожен воркер по колу: каталог з пошуком і фільтрами, картка матеріалу, неіснуючий матеріал (404),
# вхід, профіль і вихід. Потрібні лише bash і curl.
#
#   scripts/load.sh                                  # 4 воркери, 60 с, http://localhost:3000
#   BASE_URL=http://localhost:3000 WORKERS=10 DURATION=300 scripts/load.sh
#
# API запускати з більшим лімітом запитів, інакше частина відповідей — 429:
#   cd backend && RATE_LIMIT_MAX=100000 npm run start:otel
# Помилки й затримки для алертів — на боці API: FAULT_ERROR_RATE=0.2 FAULT_DELAY_MS=600

set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
WORKERS="${WORKERS:-4}"
DURATION="${DURATION:-60}"
PAUSE="${PAUSE:-0.2}"              # пауза між запитами воркера, с
USERS=(anna_k julia_v admin1)      # тестові акаунти з seed.js
PASSWORD="studyswap123"
QUERIES=("" "q=%D0%BA%D0%BE%D0%BD%D1%81%D0%BF%D0%B5%D0%BA%D1%82" "q=sql" "subject=%D0%91%D0%B0%D0%B7%D0%B8%20%D0%B4%D0%B0%D0%BD%D0%B8%D1%85" "course=2" "sort=title" "page=2")  # q=конспект, subject=Бази даних

# Виводить лише HTTP-статус відповіді
request() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"
}

worker() {
  local id=$1 deadline=$(( $(date +%s) + DURATION )) n=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local user=${USERS[$(( (id + n) % ${#USERS[@]} ))]}
    local query=${QUERIES[$(( RANDOM % ${#QUERIES[@]} ))]}

    echo "GET /materials $(request "$BASE_URL/materials?$query")"
    sleep "$PAUSE"
    local material_id
    material_id=$(curl -s --max-time 10 "$BASE_URL/materials" | grep -o '"id":[0-9]*' | head -n $(( RANDOM % 5 + 1 )) | tail -n 1 | cut -d: -f2)
    if [ -n "$material_id" ]; then
      echo "GET /materials/:id $(request "$BASE_URL/materials/$material_id")"
      sleep "$PAUSE"
    fi
    echo "GET /materials/:id $(request "$BASE_URL/materials/missing-$RANDOM")"
    sleep "$PAUSE"

    local token
    token=$(curl -s --max-time 10 -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
      -d "{\"login\":\"$user\",\"password\":\"$PASSWORD\"}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$token" ]; then
      echo "POST /auth/login 200"
      echo "GET /users/me $(request -H "Authorization: Bearer $token" "$BASE_URL/users/me")"
      echo "POST /auth/logout $(request -X POST -H "Authorization: Bearer $token" "$BASE_URL/auth/logout")"
    else
      echo "POST /auth/login fail"
    fi
    sleep "$PAUSE"
    n=$(( n + 1 ))
  done
}

echo "Навантаження: $WORKERS воркери(ів) × ${DURATION} с на $BASE_URL"
results=$(mktemp)
trap 'rm -f "$results"' EXIT
for i in $(seq 1 "$WORKERS"); do
  worker "$i" >> "$results" &
done
wait

echo "Запитів: $(wc -l < "$results" | tr -d ' ')"
echo "Кількість | роут | статус:"
sort "$results" | uniq -c | sort -rn
