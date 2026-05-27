import { firebaseConfig, forumDocumentPath } from "./firebase-config.js";

/* MediCaps Commons database
 *
 * Firebase mode:
 * The deployed site stores forum data in one Cloud Firestore document so every
 * device sees the same students, tags, posts, and replies in real time.
 *
 * Local fallback:
 * If firebase-config.js has not been filled in yet, the app still runs with
 * localStorage for development, but that data is private to one browser.
 *
 * Table-like collections and columns:
 * students: id, name, email, password, department, role, createdAt
 * admins: id, name, email, password, role, createdAt
 * tags: id, name, category, createdBy, createdAt
 * posts: id, title, content, type, authorId, authorRole, createdAt, updatedAt
 * replies: id, postId, content, authorId, authorRole, createdAt
 * postTags: id, postId, tagId, createdAt
 */

var STORAGE_KEY = "medicaps_commons_db_v1";
var SESSION_KEY = "medicaps_commons_session_v1";

var cachedData = null;
var firestoreDb = null;
var forumDocRef = null;
var unsubscribeFromFirestore = null;
var initializePromise = null;
var firebaseApi = null;
var subscribers = [];
var storageStatus = {
  mode: "local",
  remoteReady: false,
  message: "Using this browser's local storage until Firebase is configured."
};

function clone(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function toId(prefix, number) {
  return prefix + "-" + number;
}

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isValidCollegeEmail(email) {
  var lower = normalize(email);
  return lower.includes("@") && lower.endsWith("medicaps.ac.in");
}

function createBaseData() {
  return {
    meta: {
      version: 1,
      counters: {
        student: 0,
        admin: 1,
        tag: 8,
        post: 1,
        reply: 0,
        postTag: 2
      },
      createdAt: now()
    },
    students: [],
    admins: [
      {
        id: "admin-1",
        name: "Beerbee Admin",
        email: "admin@beerbee.inc",
        password: "Admin@123",
        role: "admin",
        createdAt: now()
      }
    ],
    tags: [
      { id: "tag-1", name: "B.Tech CSE", category: "course", createdBy: "system", createdAt: now() },
      { id: "tag-2", name: "Semester 4", category: "semester", createdBy: "system", createdAt: now() },
      { id: "tag-3", name: "Faculty Guidance", category: "faculty", createdBy: "system", createdAt: now() },
      { id: "tag-4", name: "Campus Advice", category: "general", createdBy: "system", createdAt: now() },
      { id: "tag-5", name: "Announcements", category: "general", createdBy: "system", createdAt: now() },
      { id: "tag-6", name: "Admin", category: "general", createdBy: "system", createdAt: now() },
      { id: "tag-7", name: "Placement Prep", category: "general", createdBy: "system", createdAt: now() },
      { id: "tag-8", name: "Medi-Caps", category: "general", createdBy: "system", createdAt: now() }
    ],
    posts: [
      {
        id: "post-1",
        title: "Welcome to MediCaps Commons",
        content: "Use this space to ask academic doubts, seek student advice, and explore campus discussions using tags. Admin announcements will always stay easy to spot here.",
        type: "announcement",
        authorId: "admin-1",
        authorRole: "admin",
        createdAt: now(),
        updatedAt: now()
      }
    ],
    replies: [],
    postTags: [
      { id: "postTag-1", postId: "post-1", tagId: "tag-5", createdAt: now() },
      { id: "postTag-2", postId: "post-1", tagId: "tag-6", createdAt: now() }
    ]
  };
}

function sanitizeDatabase(value) {
  var base = createBaseData();
  var data = value && typeof value === "object" ? clone(value) : base;
  data.meta = data.meta || base.meta;
  data.meta.version = data.meta.version || base.meta.version;
  data.meta.createdAt = data.meta.createdAt || base.meta.createdAt;
  data.meta.counters = Object.assign({}, base.meta.counters, data.meta.counters || {});
  data.students = ensureArray(data.students);
  data.admins = ensureArray(data.admins).length ? ensureArray(data.admins) : base.admins;
  data.tags = ensureArray(data.tags).length ? ensureArray(data.tags) : base.tags;
  data.posts = ensureArray(data.posts).length ? ensureArray(data.posts) : base.posts;
  data.replies = ensureArray(data.replies);
  data.postTags = ensureArray(data.postTags);
  return data;
}

function readLocalDatabase() {
  var raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    var base = createBaseData();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
    return base;
  }

  try {
    return sanitizeDatabase(JSON.parse(raw));
  } catch (error) {
    var fallback = createBaseData();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function writeLocalDatabase(data) {
  var cleanData = sanitizeDatabase(data);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanData));
  return clone(cleanData);
}

function isPlaceholder(value) {
  return !value || String(value).includes("PASTE_") || String(value).includes("YOUR_");
}

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig &&
    !isPlaceholder(firebaseConfig.apiKey) &&
    !isPlaceholder(firebaseConfig.authDomain) &&
    !isPlaceholder(firebaseConfig.projectId) &&
    !isPlaceholder(firebaseConfig.appId)
  );
}

async function loadFirebaseApi() {
  if (firebaseApi) {
    return firebaseApi;
  }

  var firebaseVersion = "12.13.0";
  var appModule = await import("https://www.gstatic.com/firebasejs/" + firebaseVersion + "/firebase-app.js");
  var firestoreModule = await import("https://www.gstatic.com/firebasejs/" + firebaseVersion + "/firebase-firestore.js");

  firebaseApi = {
    initializeApp: appModule.initializeApp,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    getFirestore: firestoreModule.getFirestore,
    onSnapshot: firestoreModule.onSnapshot,
    runTransaction: firestoreModule.runTransaction,
    setDoc: firestoreModule.setDoc
  };

  return firebaseApi;
}

function getForumPathSegments() {
  var path = String(forumDocumentPath || "forums/medicapsCommons")
    .split("/")
    .map(function trimSegment(segment) {
      return segment.trim();
    })
    .filter(Boolean);

  if (!path.length || path.length % 2 !== 0) {
    throw new Error("forumDocumentPath must point to a Firestore document, such as forums/medicapsCommons.");
  }

  return path;
}

function notifySubscribers() {
  subscribers.forEach(function notify(callback) {
    try {
      callback(clone(cachedData));
    } catch (error) {
      console.error(error);
    }
  });
}

async function initializeFirestore() {
  var firebase = await loadFirebaseApi();
  var app = firebase.initializeApp(firebaseConfig);
  firestoreDb = firebase.getFirestore(app);
  forumDocRef = firebase.doc(firestoreDb, ...getForumPathSegments());

  var snapshot = await firebase.getDoc(forumDocRef);

  if (snapshot.exists()) {
    cachedData = sanitizeDatabase(snapshot.data());
  } else {
    cachedData = sanitizeDatabase(readLocalDatabase());
    await firebase.setDoc(forumDocRef, clone(cachedData));
  }

  storageStatus = {
    mode: "firestore",
    remoteReady: true,
    message: "Connected to shared Firebase storage."
  };

  if (unsubscribeFromFirestore) {
    unsubscribeFromFirestore();
  }

  unsubscribeFromFirestore = firebase.onSnapshot(forumDocRef, function handleSnapshot(nextSnapshot) {
    if (!nextSnapshot.exists()) {
      return;
    }

    cachedData = sanitizeDatabase(nextSnapshot.data());
    notifySubscribers();
  }, function handleSnapshotError(error) {
    console.error(error);
    storageStatus = {
      mode: "firestore",
      remoteReady: false,
      message: "Firebase listener failed: " + error.message
    };
    notifySubscribers();
  });
}

async function initialize() {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async function startDatabase() {
    if (!hasFirebaseConfig()) {
      cachedData = sanitizeDatabase(readLocalDatabase());
      storageStatus = {
        mode: "local",
        remoteReady: false,
        message: "Firebase is not configured yet. This browser is using local storage only."
      };
      return clone(cachedData);
    }

    try {
      await initializeFirestore();
      return clone(cachedData);
    } catch (error) {
      console.error(error);
      cachedData = sanitizeDatabase(readLocalDatabase());
      storageStatus = {
        mode: "local",
        remoteReady: false,
        message: "Firebase could not connect, so this browser is using local storage only. " + error.message
      };
      return clone(cachedData);
    }
  })();

  return initializePromise;
}

function getCurrentData() {
  if (!cachedData) {
    cachedData = sanitizeDatabase(readLocalDatabase());
  }
  return clone(cachedData);
}

async function mutate(mutator) {
  await initialize();

  if (storageStatus.mode === "firestore" && forumDocRef && firestoreDb) {
    var firebase = await loadFirebaseApi();
    var nextData;
    var output;

    await firebase.runTransaction(firestoreDb, async function updateForum(transaction) {
      var snapshot = await transaction.get(forumDocRef);
      var data = snapshot.exists()
        ? sanitizeDatabase(snapshot.data())
        : sanitizeDatabase(readLocalDatabase());

      output = mutator(data);
      nextData = sanitizeDatabase(data);
      transaction.set(forumDocRef, clone(nextData));
    });

    cachedData = sanitizeDatabase(nextData);
    notifySubscribers();
    return clone(output);
  }

  var localData = sanitizeDatabase(readLocalDatabase());
  var localOutput = mutator(localData);
  cachedData = writeLocalDatabase(localData);
  notifySubscribers();
  return clone(localOutput);
}

function nextId(data, counterKey) {
  data.meta.counters[counterKey] += 1;
  return toId(counterKey, data.meta.counters[counterKey]);
}

function getUser(data, role, id) {
  var collection = role === "admin" ? data.admins : data.students;
  return collection.find(function findUser(item) {
    return item.id === id;
  }) || null;
}

function getTagUsage(data, tagId) {
  return data.postTags.filter(function findTagLink(link) {
    return link.tagId === tagId;
  }).length;
}

function getPostTags(data, postId) {
  var tagIds = data.postTags
    .filter(function matchPost(link) {
      return link.postId === postId;
    })
    .map(function getTagId(link) {
      return link.tagId;
    });

  return data.tags.filter(function filterTag(tag) {
    return tagIds.includes(tag.id);
  });
}

function hydratePost(data, post) {
  var author = getUser(data, post.authorRole, post.authorId);
  var replies = data.replies
    .filter(function matchReply(reply) {
      return reply.postId === post.id;
    })
    .map(function mapReply(reply) {
      var replyAuthor = getUser(data, reply.authorRole, reply.authorId);
      return {
        id: reply.id,
        postId: reply.postId,
        content: reply.content,
        createdAt: reply.createdAt,
        authorId: reply.authorId,
        authorRole: reply.authorRole,
        authorName: replyAuthor ? replyAuthor.name : "Deleted User"
      };
    })
    .sort(function sortReplies(a, b) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    type: post.type,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    authorId: post.authorId,
    authorRole: post.authorRole,
    authorName: author ? author.name : "Deleted User",
    tags: getPostTags(data, post.id),
    replies: replies
  };
}

function uniqueIds(values) {
  return Array.from(new Set(ensureArray(values).filter(Boolean)));
}

var MediCapsDB = {
  initialize: initialize,

  onChange: function onChange(callback) {
    subscribers.push(callback);
    return function unsubscribe() {
      subscribers = subscribers.filter(function keepSubscriber(item) {
        return item !== callback;
      });
    };
  },

  getStorageStatus: function getStorageStatus() {
    return Object.assign({}, storageStatus);
  },

  read: function read() {
    return getCurrentData();
  },

  getSession: function getSession() {
    var raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  saveSession: function saveSession(session) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return clone(session);
  },

  clearSession: function clearSession() {
    window.localStorage.removeItem(SESSION_KEY);
  },

  createStudent: function createStudent(payload) {
    return mutate(function createStudentMutation(data) {
      var email = normalize(payload.email);

      if (!isValidCollegeEmail(email)) {
        throw new Error("Only Medi-Caps email addresses ending in medicaps.ac.in are allowed.");
      }

      var existingUser = data.students.some(function matchStudent(student) {
        return normalize(student.email) === email;
      });
      var existingAdmin = data.admins.some(function matchAdmin(admin) {
        return normalize(admin.email) === email;
      });

      if (existingUser || existingAdmin) {
        throw new Error("An account with this email already exists.");
      }

      var student = {
        id: nextId(data, "student"),
        name: String(payload.name || "").trim(),
        email: email,
        password: String(payload.password || "").trim(),
        department: String(payload.department || "").trim(),
        role: "student",
        createdAt: now()
      };

      data.students.push(student);
      return student;
    });
  },

  authenticateStudent: function authenticateStudent(payload) {
    var data = getCurrentData();
    var email = normalize(payload.email);
    var password = String(payload.password || "").trim();

    var student = data.students.find(function matchStudent(item) {
      return normalize(item.email) === email && item.password === password;
    });

    if (!student) {
      throw new Error("Invalid student email or password.");
    }

    return clone(student);
  },

  authenticateAdmin: function authenticateAdmin(payload) {
    var data = getCurrentData();
    var email = normalize(payload.email);
    var password = String(payload.password || "").trim();

    var admin = data.admins.find(function matchAdmin(item) {
      return normalize(item.email) === email && item.password === password;
    });

    if (!admin) {
      throw new Error("Invalid admin email or password.");
    }

    return clone(admin);
  },

  getAllTags: function getAllTags() {
    var data = getCurrentData();
    return data.tags
      .map(function enrichTag(tag) {
        return {
          id: tag.id,
          name: tag.name,
          category: tag.category,
          createdBy: tag.createdBy,
          createdAt: tag.createdAt,
          usageCount: getTagUsage(data, tag.id)
        };
      })
      .sort(function sortTags(a, b) {
        if (a.category === b.category) {
          return a.name.localeCompare(b.name);
        }
        return a.category.localeCompare(b.category);
      });
  },

  getGroupedTags: function getGroupedTags() {
    var groups = {
      course: [],
      semester: [],
      faculty: [],
      general: []
    };

    MediCapsDB.getAllTags().forEach(function placeTag(tag) {
      var bucket = groups[tag.category] || groups.general;
      bucket.push(tag);
    });

    return groups;
  },

  createTag: function createTag(payload) {
    return mutate(function createTagMutation(data) {
      var name = String(payload.name || "").trim();
      var category = String(payload.category || "general").trim().toLowerCase();

      if (!name) {
        throw new Error("Tag name cannot be empty.");
      }

      if (!["course", "semester", "faculty", "general"].includes(category)) {
        category = "general";
      }

      var existing = data.tags.find(function matchTag(tag) {
        return normalize(tag.name) === normalize(name) && tag.category === category;
      });

      if (existing) {
        return existing;
      }

      var tag = {
        id: nextId(data, "tag"),
        name: name,
        category: category,
        createdBy: payload.createdBy || "unknown",
        createdAt: now()
      };

      data.tags.push(tag);
      return tag;
    });
  },

  deleteTag: function deleteTag(tagId) {
    return mutate(function deleteTagMutation(data) {
      data.tags = data.tags.filter(function keepTag(tag) {
        return tag.id !== tagId;
      });
      data.postTags = data.postTags.filter(function keepLink(link) {
        return link.tagId !== tagId;
      });
    });
  },

  createPost: function createPost(payload) {
    return mutate(function createPostMutation(data) {
      var type = String(payload.type || "problem").trim().toLowerCase();
      var allowedTypes = payload.authorRole === "admin"
        ? ["problem", "advice", "announcement"]
        : ["problem", "advice"];

      if (!allowedTypes.includes(type)) {
        throw new Error("This account cannot create that type of post.");
      }

      var post = {
        id: nextId(data, "post"),
        title: String(payload.title || "").trim(),
        content: String(payload.content || "").trim(),
        type: type,
        authorId: payload.authorId,
        authorRole: payload.authorRole,
        createdAt: now(),
        updatedAt: now()
      };

      if (!post.title || !post.content) {
        throw new Error("Post title and details are required.");
      }

      data.posts.push(post);

      var tagIds = uniqueIds(payload.tagIds);

      if (type === "announcement" && payload.authorRole === "admin") {
        var announcementTag = data.tags.find(function findTag(tag) {
          return normalize(tag.name) === "announcements";
        });
        var adminTag = data.tags.find(function findTag(tag) {
          return normalize(tag.name) === "admin";
        });
        if (announcementTag) {
          tagIds.push(announcementTag.id);
        }
        if (adminTag) {
          tagIds.push(adminTag.id);
        }
        tagIds = uniqueIds(tagIds);
      }

      tagIds.forEach(function attachTag(tagId) {
        data.postTags.push({
          id: nextId(data, "postTag"),
          postId: post.id,
          tagId: tagId,
          createdAt: now()
        });
      });

      return hydratePost(data, post);
    });
  },

  createReply: function createReply(payload) {
    return mutate(function createReplyMutation(data) {
      var post = data.posts.find(function findPost(item) {
        return item.id === payload.postId;
      });

      if (!post) {
        throw new Error("The selected post no longer exists.");
      }

      var reply = {
        id: nextId(data, "reply"),
        postId: payload.postId,
        content: String(payload.content || "").trim(),
        authorId: payload.authorId,
        authorRole: payload.authorRole,
        createdAt: now()
      };

      if (!reply.content) {
        throw new Error("Reply cannot be empty.");
      }

      data.replies.push(reply);
      return reply;
    });
  },

  deletePost: function deletePost(postId) {
    return mutate(function deletePostMutation(data) {
      data.posts = data.posts.filter(function keepPost(post) {
        return post.id !== postId;
      });
      data.replies = data.replies.filter(function keepReply(reply) {
        return reply.postId !== postId;
      });
      data.postTags = data.postTags.filter(function keepLink(link) {
        return link.postId !== postId;
      });
    });
  },

  deleteReply: function deleteReply(replyId) {
    return mutate(function deleteReplyMutation(data) {
      data.replies = data.replies.filter(function keepReply(reply) {
        return reply.id !== replyId;
      });
    });
  },

  attachTagToPost: function attachTagToPost(postId, tagId) {
    return mutate(function attachTagToPostMutation(data) {
      var exists = data.postTags.some(function hasLink(link) {
        return link.postId === postId && link.tagId === tagId;
      });

      if (!exists) {
        data.postTags.push({
          id: nextId(data, "postTag"),
          postId: postId,
          tagId: tagId,
          createdAt: now()
        });
      }
    });
  },

  detachTagFromPost: function detachTagFromPost(postId, tagId) {
    return mutate(function detachTagFromPostMutation(data) {
      data.postTags = data.postTags.filter(function keepLink(link) {
        return !(link.postId === postId && link.tagId === tagId);
      });
    });
  },

  getPosts: function getPosts(filters) {
    var data = getCurrentData();
    var query = normalize(filters && filters.query);
    var tagIds = uniqueIds(filters && filters.tagIds);

    return data.posts
      .map(function mapPost(post) {
        return hydratePost(data, post);
      })
      .filter(function filterPost(post) {
        var haystack = [
          post.title,
          post.content,
          post.authorName,
          post.tags.map(function getTagName(tag) { return tag.name; }).join(" ")
        ].join(" ").toLowerCase();

        var matchesQuery = !query || haystack.includes(query);
        var matchesTags = !tagIds.length || tagIds.every(function everyTag(tagId) {
          return post.tags.some(function matchTag(tag) {
            return tag.id === tagId;
          });
        });

        return matchesQuery && matchesTags;
      })
      .sort(function sortPosts(a, b) {
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  },

  getStats: function getStats() {
    var data = getCurrentData();
    return {
      students: data.students.length,
      posts: data.posts.length,
      replies: data.replies.length,
      tags: data.tags.length
    };
  }
};

export { MediCapsDB };
