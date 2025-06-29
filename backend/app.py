import json
import uuid
from datetime import datetime
from flask import Flask, send_from_directory, request, jsonify, session, Response, stream_with_context, redirect, url_for, render_template_string, render_template
import os
from dotenv import load_dotenv
import openai
from flask_cors import CORS
import httpx
from functools import wraps

load_dotenv()

#openai.api_key = os.getenv("OPENAI_API_KEY")

client = httpx.Client(proxy=os.getenv("PROXY_URL_HTTP"))
openai_client = openai.OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=client
)

app = Flask(__name__, static_folder="../public", static_url_path="")
app.secret_key = os.getenv("FLASK_SECRET_KEY", "fallback-dev-key")

CORS(app)

chat_histories = {}

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '')
        password = request.form.get('password', '')
        env_username = os.getenv('LOGIN_USERNAME', 'superuser')
        env_password = os.getenv('LOGIN_PASSWORD', 'superpassword')
        if username == env_username and password == env_password:
            session['logged_in'] = True
            return redirect(request.args.get('next') or url_for('index'))
        else:
            return redirect(url_for('login', error='bad'))
    return send_from_directory('../public/html', 'login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/')
@login_required
def index():
    return send_from_directory('../public/html', 'index.html')

@app.route('/api/chats')
@login_required
def get_chats():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, '../data/chats.json')

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)

@app.route('/chat')
@login_required
def chat():
    return send_from_directory('../public/html', 'chat.html')

@app.route('/src/<path:path>')
def serve_src(path):
    return send_from_directory('../src', path)

@app.route('/api/chats/new', methods=['POST'])
@login_required
def create_new_chat():
    data = request.get_json()
    title = data.get('title', '').strip() if data else ''

    session_id = str(uuid.uuid4())
    session['session_id'] = session_id
    chat_histories[session_id] = [{"role": "system", "content": "Ты дружелюбный помощник."}]

    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, '../data/chats.json')

    with open(json_path, 'r', encoding='utf-8') as f:
        chats_data = json.load(f)

    chat_id = str(uuid.uuid4())
    new_chat = {
        "id": chat_id,
        "session_id": session_id,
        "title": title,
        "messages": [],
        "created_at": datetime.now().isoformat()
    }

    chats_data["chats"].insert(0, new_chat)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(chats_data, f, ensure_ascii=False, indent=2)

    return jsonify({"id": chat_id, "session_id": session_id})

@app.route('/api/chat/<chat_id>', methods=['GET'])
@login_required
def get_chat(chat_id):
    if not os.path.exists('../data/chats.json'):
        return jsonify({'error': 'Файл чатов не найден'}), 404

    with open('../data/chats.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        chat = next((c for c in data['chats'] if str(c['id']) == str(chat_id)), None)

        if chat is None:
            return jsonify({'error': 'Чат не найден'}), 404

        return jsonify(chat)

@app.route('/api/message', methods=['POST'])
@login_required
def chat_message():
    data = request.get_json()
    user_message = data.get('message', '').strip()
    chat_id = data.get('chat_id')

    if not user_message or not chat_id:
        return jsonify({"error": "Нет текста или ID чата"}), 400

    session_id = None
    with open('../data/chats.json', 'r', encoding='utf-8') as f:
        chats_data = json.load(f)
        for chat in chats_data['chats']:
            if chat['id'] == chat_id:
                session_id = chat.get('session_id')
                break

    if not session_id:
        return jsonify({"error": "Сессия не найдена для этого чата"}), 400

    if session_id not in chat_histories:
        chat_histories[session_id] = get_history_from_file(chat_id)
    history = chat_histories[session_id]

    history.append({"role": "user", "content": user_message})
    trimmed = [history[0]] + [m for m in history if m['role'] != 'system'][-10:]

    def generate():
        full_reply = ''
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4.1",
                messages=trimmed,
                temperature=0.7,
                stream=True
            )
            for chunk in response:
                content = chunk.choices[0].delta.content or ''
                full_reply += content
                yield content
        except Exception as e:
            yield f'\n[Ошибка генерации: {str(e)}]'

        history.append({"role": "assistant", "content": full_reply})

        for chat in chats_data["chats"]:
            if chat["id"] == chat_id:
                chat["messages"].append({"sender": "user", "text": user_message})
                chat["messages"].append({"sender": "bot", "text": full_reply})
                break

        with open('../data/chats.json', 'w', encoding='utf-8') as f:
            json.dump(chats_data, f, ensure_ascii=False, indent=2)

    return Response(stream_with_context(generate()), content_type='text/plain')

def get_history_from_file(chat_id):
    with open('../data/chats.json', 'r', encoding='utf-8') as f:
        chats_data = json.load(f)
        for chat in chats_data['chats']:
            if chat['id'] == chat_id:
                history = [{"role": "system", "content": "Ты дружелюбный помощник."}]
                for m in chat['messages']:
                    if m['sender'] == "user":
                        history.append({"role": "user", "content": m['text']})
                    elif m['sender'] == "bot":
                        history.append({"role": "assistant", "content": m['text']})
                return history
    return [{"role": "system", "content": "Ты дружелюбный помощник."}]

@app.route('/api/chats/<chat_id>/title', methods=['PUT'])
@login_required
def update_chat_title(chat_id):
    data = request.get_json()
    new_title = data.get('title', '').strip()
    if not new_title:
        return jsonify({"error": "Пустой заголовок"}), 400

    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, '../data/chats.json')

    with open(json_path, 'r', encoding='utf-8') as f:
        chats_data = json.load(f)

    for chat in chats_data['chats']:
        if chat['id'] == chat_id:
            chat['title'] = new_title
            break
    else:
        return jsonify({"error": "Чат не найден"}), 404

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(chats_data, f, ensure_ascii=False, indent=2)

    return jsonify({"message": "Заголовок обновлён"})

def extract_title(text):
    words = text.strip().split()
    return ' '.join(words[:3])

def save_chat_to_file(session_id, user_msg, bot_reply):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, '../data/chats.json')

    with open(json_path, 'r', encoding='utf-8') as f:
        chats_data = json.load(f)

    for chat in chats_data['chats']:
        if str(chat.get('session_id')) == session_id:
            break
    else:
        new_chat_id = str(uuid.uuid4())
        chat = {
            "id": new_chat_id,
            "session_id": session_id,
            "title": user_msg.split()[:2] and ' '.join(user_msg.split()[:2]) or "Новый чат",
            "messages": [],
            "created_at": datetime.now().isoformat()
        }
        chats_data["chats"].insert(0, chat)

    chat["messages"].append({"sender": "user", "text": user_msg})
    chat["messages"].append({"sender": "bot", "text": bot_reply})

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(chats_data, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    app.run(debug=True)