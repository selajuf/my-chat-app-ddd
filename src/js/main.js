window.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".start-button").addEventListener("click", () => {
        window.location.href = "/chat";
    });
});

const subtitles = [
    "Я понимаю тебя лучше, чем ты думаешь",
    "Задай вопрос — и получи больше, чем ответ",
    "Разговор начинается с одного слова"
];

const subtitleElement = document.querySelector(".subtitle");
const cursorSpan = document.createElement("span");
cursorSpan.classList.add("cursor");
cursorSpan.textContent = " |";
subtitleElement.appendChild(cursorSpan);

let currentTextIndex = 0;
let charIndex = 0;
let isDeleting = false;
let isPaused = false;

typeEffect();

function typeEffect() {
    if (isPaused) return;

    const currentText = subtitles[currentTextIndex];
    const displayedText = currentText.substring(0, charIndex);
    subtitleElement.firstChild.nodeValue = displayedText;

    stopBlinking(); // пока печатает — курсор не мигает

    if (!isDeleting) {
        if (charIndex < currentText.length) {
            charIndex++;
            setTimeout(typeEffect, 70);
        } else {
            startBlinking(); // закончил печатать — курсор мигает
            isPaused = true;
            setTimeout(() => {
                isDeleting = true;
                isPaused = false;
                stopBlinking(); // начинает удалять — курсор не мигает
                setTimeout(typeEffect, 500);
            }, 2200);
        }
    } else {
        if (charIndex > 0) {
            charIndex--;
            setTimeout(typeEffect, 40);
        } else {
            currentTextIndex = (currentTextIndex + 1) % subtitles.length;
            isDeleting = false;
            startBlinking();
            setTimeout(() => {
                stopBlinking();
                typeEffect();
            }, 300);
        }
    }
}

function toggleTheme() {
    document.body.classList.toggle("dark-theme");

    const themeIcon = document.querySelector(".theme-toggle");
    const logoIcon = document.querySelector(".logo");

    const isDark = document.body.classList.contains("dark-theme");

    themeIcon.src = isDark
        ? "../../src/img/theme-toggle_sun.png"
        : "../../src/img/theme-toggle_moon.png";

    logoIcon.src = isDark
        ? "../../src/img/openai_logo_white.png"
        : "../../src/img/openai_logo_dark.png";
}

function startBlinking() {
    cursorSpan.classList.add("blinking");
}

function stopBlinking() {
    cursorSpan.classList.remove("blinking");
}