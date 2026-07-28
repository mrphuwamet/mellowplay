-- Consumer app "like a recommended class" / comment feature (the feed's
-- course-suggestion cards) — mirrors News_Feed_Likes/News_Feed_Comments
-- exactly (see migrations/0001_init.sql), just keyed by course_id.
CREATE TABLE Course_Likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, user_id),
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

CREATE TABLE Course_Comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

CREATE INDEX idx_course_comments_course_id ON Course_Comments(course_id);
