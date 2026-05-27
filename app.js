import { MediCapsDB as db } from "./database.js";

(function forumApp() {
  "use strict";

  var state = {
    currentUser: db.getSession(),
    searchQuery: "",
    selectedSearchTags: [],
    selectedComposerTags: [],
    authTab: "student-login",
    tagMenuOpen: false
  };

  var categoryLabels = {
    course: "Course Tags",
    semester: "Semester Tags",
    faculty: "Faculty Tags",
    general: "General Tags"
  };

  var elements = {
    heroStats: document.getElementById("heroStats"),
    tagNavigator: document.getElementById("tagNavigator"),
    authMessage: document.getElementById("authMessage"),
    adminPanel: document.getElementById("adminPanel"),
    adminTagList: document.getElementById("adminTagList"),
    welcomeTitle: document.getElementById("welcomeTitle"),
    welcomeText: document.getElementById("welcomeText"),
    userAvatar: document.getElementById("userAvatar"),
    logoutBtn: document.getElementById("logoutBtn"),
    searchInput: document.getElementById("searchInput"),
    searchBtn: document.getElementById("searchBtn"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),
    toggleTagMenuBtn: document.getElementById("toggleTagMenuBtn"),
    searchSummary: document.getElementById("searchSummary"),
    searchTagMenu: document.getElementById("searchTagMenu"),
    composerSection: document.getElementById("composerSection"),
    composerTagSelector: document.getElementById("composerTagSelector"),
    selectedPostTags: document.getElementById("selectedPostTags"),
    addNewTagBtn: document.getElementById("addNewTagBtn"),
    newTagName: document.getElementById("newTagName"),
    newTagCategory: document.getElementById("newTagCategory"),
    postType: document.getElementById("postType"),
    postsContainer: document.getElementById("postsContainer")
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    return new Date(value).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function showMessage(text, type) {
    elements.authMessage.className = "message show " + (type || "success");
    elements.authMessage.textContent = text;
  }

  function clearMessage() {
    elements.authMessage.className = "message";
    elements.authMessage.textContent = "";
  }

  function getInitials(name) {
    return String(name || "MC")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function takeFirst(part) {
        return part.charAt(0).toUpperCase();
      })
      .join("") || "MC";
  }

  function setAuthTab(tabName) {
    state.authTab = tabName;
    clearMessage();

    document.querySelectorAll("[data-auth-tab]").forEach(function toggleTab(button) {
      button.classList.toggle("active", button.dataset.authTab === tabName);
    });

    document.querySelectorAll(".auth-panel").forEach(function togglePanel(panel) {
      panel.classList.toggle("active", panel.id === panelIdFromTab(tabName));
    });
  }

  function panelIdFromTab(tabName) {
    if (tabName === "student-signup") {
      return "studentSignupForm";
    }
    if (tabName === "admin-login") {
      return "adminLoginForm";
    }
    return "studentLoginForm";
  }

  function isAdmin() {
    return state.currentUser && state.currentUser.role === "admin";
  }

  function isLoggedIn() {
    return Boolean(state.currentUser);
  }

  function syncSession() {
    if (state.currentUser) {
      db.saveSession(state.currentUser);
    } else {
      db.clearSession();
    }
  }

  function renderHeroStats() {
    var stats = db.getStats();
    elements.heroStats.innerHTML = [
      '<div class="stat-pill"><strong>' + stats.students + '</strong><span>Students</span></div>',
      '<div class="stat-pill"><strong>' + stats.posts + '</strong><span>Posts</span></div>',
      '<div class="stat-pill"><strong>' + stats.replies + '</strong><span>Replies</span></div>',
      '<div class="stat-pill"><strong>' + stats.tags + '</strong><span>Tags</span></div>'
    ].join("");
  }

  function renderTagGroupContent(tags, mode) {
    if (!tags.length) {
      return '<div class="empty">No tags in this group yet.</div>';
    }

    return '<div class="chip-wrap">' + tags.map(function mapTag(tag) {
      var active = mode === "search"
        ? state.selectedSearchTags.includes(tag.id)
        : state.selectedComposerTags.includes(tag.id);
      var label = escapeHtml(tag.name) + ' <span class="helper">(' + tag.usageCount + ')</span>';
      return (
        '<button class="tag-chip ' + (active ? "active" : "") + '" type="button" ' +
        'data-tag-action="' + mode + '" data-tag-id="' + tag.id + '">' + label + '</button>'
      );
    }).join("") + "</div>";
  }

  function renderGroupedTags(target, mode) {
    var groups = db.getGroupedTags();
    target.innerHTML = Object.keys(categoryLabels).map(function mapGroup(category) {
      var tags = groups[category] || [];
      return (
        '<div class="tag-group">' +
          '<div class="tag-group-header">' +
            '<strong>' + categoryLabels[category] + '</strong>' +
            '<span class="helper">' + tags.length + ' tags</span>' +
          '</div>' +
          renderTagGroupContent(tags, mode) +
        '</div>'
      );
    }).join("");
  }

  function renderAdminTagList() {
    var tags = db.getAllTags();
    if (!tags.length) {
      elements.adminTagList.innerHTML = '<div class="empty" style="width:100%;">No tags available.</div>';
      return;
    }

    elements.adminTagList.innerHTML = tags.map(function mapTag(tag) {
      return (
        '<span class="tag-chip">' +
          escapeHtml(tag.name) +
          ' <button class="remove-badge" type="button" data-admin-delete-tag="' + tag.id + '">x</button>' +
        '</span>'
      );
    }).join("");
  }

  function renderSelectedComposerTags() {
    var allTags = db.getAllTags();
    var tags = allTags.filter(function filterTag(tag) {
      return state.selectedComposerTags.includes(tag.id);
    });

    if (!tags.length) {
      elements.selectedPostTags.innerHTML = '<span class="helper">No tags selected yet.</span>';
      return;
    }

    elements.selectedPostTags.innerHTML = tags.map(function mapTag(tag) {
      return (
        '<button class="tag-chip active" type="button" data-remove-composer-tag="' + tag.id + '">' +
          escapeHtml(tag.name) + ' <span class="remove-badge">x</span>' +
        '</button>'
      );
    }).join("");
  }

  function updateSearchSummary(posts) {
    var tagNames = db.getAllTags()
      .filter(function filterTag(tag) {
        return state.selectedSearchTags.includes(tag.id);
      })
      .map(function mapTag(tag) {
        return tag.name;
      });

    var parts = [];

    if (state.searchQuery) {
      parts.push('text "' + state.searchQuery + '"');
    }
    if (tagNames.length) {
      parts.push("tags " + tagNames.join(", "));
    }

    elements.searchSummary.textContent = parts.length
      ? "Showing " + posts.length + " result(s) for " + parts.join(" and ") + "."
      : "Showing all posts on the platform.";
  }

  function renderToolbar() {
    if (!isLoggedIn()) {
      elements.welcomeTitle.textContent = "Browse the community";
      elements.welcomeText.textContent = "Login to create posts, reply, and use personalized controls.";
      elements.userAvatar.textContent = "MC";
      elements.logoutBtn.classList.add("hidden");
      elements.composerSection.classList.add("hidden");
      elements.adminPanel.classList.add("hidden");
      return;
    }

    elements.userAvatar.textContent = getInitials(state.currentUser.name);
    elements.logoutBtn.classList.remove("hidden");
    elements.composerSection.classList.remove("hidden");

    if (isAdmin()) {
      elements.welcomeTitle.textContent = "Admin dashboard";
      elements.welcomeText.textContent = "Publish announcements, manage tags, and moderate the MediCaps Commons feed.";
      elements.adminPanel.classList.remove("hidden");
    } else {
      elements.welcomeTitle.textContent = "Welcome, " + state.currentUser.name;
      elements.welcomeText.textContent = "Ask doubts, seek advice, and help classmates with replies and solutions.";
      elements.adminPanel.classList.add("hidden");
    }

    elements.postType.querySelector('option[value="announcement"]').hidden = !isAdmin();
    if (!isAdmin() && elements.postType.value === "announcement") {
      elements.postType.value = "problem";
    }
  }

  function renderSearchTagMenu() {
    elements.searchTagMenu.classList.toggle("open", state.tagMenuOpen);
    renderGroupedTags(elements.searchTagMenu, "search");
  }

  function renderComposerTagSelector() {
    renderGroupedTags(elements.composerTagSelector, "compose");
    renderSelectedComposerTags();
  }

  function createPostHtml(post) {
    var isPostAdmin = post.authorRole === "admin";
    var canModerate = isAdmin();
    var tagOptions = db.getAllTags().map(function mapOption(tag) {
      return '<option value="' + tag.id + '">' + escapeHtml(tag.name) + " (" + escapeHtml(tag.category) + ')</option>';
    }).join("");
    var replyHtml = post.replies.length ? post.replies.map(function mapReply(reply) {
      return (
        '<div class="reply-card">' +
          '<div class="reply-head">' +
            '<div class="reply-meta">' +
              '<strong>' + escapeHtml(reply.authorName) + '</strong>' +
              '<span>' + escapeHtml(reply.authorRole) + '</span>' +
              '<span>' + formatDate(reply.createdAt) + '</span>' +
            '</div>' +
            (canModerate
              ? '<button class="small-btn" type="button" data-delete-reply="' + reply.id + '">Delete</button>'
              : '') +
          '</div>' +
          '<div class="reply-body">' + escapeHtml(reply.content) + '</div>' +
        '</div>'
      );
    }).join("") : '<div class="muted-line">No replies yet. Be the first to help.</div>';

    var tagHtml = post.tags.length ? post.tags.map(function mapTag(tag) {
      return (
        '<button class="tag-chip" type="button" data-click-tag="' + tag.id + '">' +
          escapeHtml(tag.name) +
          (canModerate
            ? ' <span class="remove-badge" data-remove-post-tag="' + post.id + '::' + tag.id + '">x</span>'
            : "") +
        '</button>'
      );
    }).join("") : '<span class="helper">No tags attached</span>';

    return (
      '<article class="post-card">' +
        '<div class="post-head">' +
          '<div class="post-meta">' +
            '<span class="pill ' + escapeHtml(post.type) + '">' + escapeHtml(post.type) + '</span>' +
            '<strong>' + escapeHtml(post.authorName) + '</strong>' +
            '<span>' + (isPostAdmin ? "Admin" : "Student") + '</span>' +
            '<span>' + formatDate(post.createdAt) + '</span>' +
          '</div>' +
          (canModerate ? '<button class="small-btn" type="button" data-delete-post="' + post.id + '">Delete Post</button>' : "") +
        '</div>' +
        '<h3>' + escapeHtml(post.title) + '</h3>' +
        '<div class="post-body">' + escapeHtml(post.content) + '</div>' +
        '<div class="divider"></div>' +
        '<div class="chip-wrap">' + tagHtml + '</div>' +
        (canModerate
          ? '<form class="reply-form" data-admin-attach-form="' + post.id + '">' +
              '<select name="tagId" required>' + tagOptions + '</select>' +
              '<button class="small-btn" type="submit">Add Tag to Post</button>' +
            '</form>'
          : '') +
        '<div class="replies">' +
          '<div class="admin-row">' +
            '<strong>Replies</strong>' +
            '<span class="helper">' + post.replies.length + ' response(s)</span>' +
          '</div>' +
          replyHtml +
        '</div>' +
        (isLoggedIn()
          ? '<form class="reply-form" data-reply-form="' + post.id + '">' +
              '<textarea name="content" placeholder="Share a solution, clarification, or advice..." required></textarea>' +
              '<button class="primary-btn" type="submit">Reply</button>' +
            '</form>'
          : '<div class="muted-line" style="margin-top: 12px;">Login to reply to this post.</div>') +
      '</article>'
    );
  }

  function renderPosts() {
    var posts = db.getPosts({
      query: state.searchQuery,
      tagIds: state.selectedSearchTags
    });

    updateSearchSummary(posts);

    if (!posts.length) {
      elements.postsContainer.innerHTML = '<div class="empty">No posts match your current search. Try clearing filters or creating a new post.</div>';
      return;
    }

    elements.postsContainer.innerHTML = posts.map(createPostHtml).join("");
  }

  function refresh() {
    renderHeroStats();
    renderToolbar();
    renderTagGroupNavigator();
    renderSearchTagMenu();
    renderComposerTagSelector();
    renderAdminTagList();
    renderPosts();
    syncSession();
  }

  function renderTagGroupNavigator() {
    renderGroupedTags(elements.tagNavigator, "search");
  }

  function toggleSelection(list, value) {
    if (list.includes(value)) {
      return list.filter(function remove(item) {
        return item !== value;
      });
    }
    return list.concat(value);
  }

  async function saveChange(action, successMessage) {
    try {
      await action();
      showMessage(successMessage, "success");
      refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function addComposerTagByName() {
    if (!isLoggedIn()) {
      showMessage("Login first to prepare post tags.", "error");
      return;
    }

    var name = elements.newTagName.value.trim();
    var category = elements.newTagCategory.value;

    if (!name) {
      showMessage("Enter a tag name before adding it.", "error");
      return;
    }

    try {
      var tag = await db.createTag({
        name: name,
        category: category,
        createdBy: state.currentUser.id
      });

      if (!state.selectedComposerTags.includes(tag.id)) {
        state.selectedComposerTags.push(tag.id);
      }

      elements.newTagName.value = "";
      showMessage("Tag added to the platform and selected for your post.", "success");
      refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function handlePostSubmit(event) {
    event.preventDefault();

    if (!isLoggedIn()) {
      showMessage("Please login before publishing a post.", "error");
      return;
    }

    var form = event.currentTarget;
    var type = form.type.value;

    try {
      await db.createPost({
        title: form.title.value,
        content: form.content.value,
        type: type,
        authorId: state.currentUser.id,
        authorRole: state.currentUser.role,
        tagIds: state.selectedComposerTags
      });

      form.reset();
      state.selectedComposerTags = [];
      elements.postType.value = isAdmin() ? "problem" : "problem";
      showMessage("Your post has been published.", "success");
      refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function handleReplySubmit(event) {
    event.preventDefault();

    if (!isLoggedIn()) {
      showMessage("Login to reply.", "error");
      return;
    }

    var form = event.target;
    var postId = form.dataset.replyForm;
    var formData = new FormData(form);
    var content = formData.get("content");

    try {
      await db.createReply({
        postId: postId,
        content: content,
        authorId: state.currentUser.id,
        authorRole: state.currentUser.role
      });

      form.reset();
      showMessage("Reply added successfully.", "success");
      refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function handleAdminAttachTag(event) {
    event.preventDefault();

    if (!isAdmin()) {
      showMessage("Only admins can attach tags to existing posts.", "error");
      return;
    }

    var form = event.target;
    var postId = form.dataset.adminAttachForm;
    var formData = new FormData(form);
    var tagId = formData.get("tagId");

    await saveChange(function attachTag() {
      return db.attachTagToPost(postId, tagId);
    }, "Tag attached to post.");
    form.reset();
  }

  async function handleDocumentClick(event) {
    var authTab = event.target.closest("[data-auth-tab]");
    if (authTab) {
      setAuthTab(authTab.dataset.authTab);
      return;
    }

    var searchTagButton = event.target.closest('[data-tag-action="search"]');
    if (searchTagButton) {
      state.selectedSearchTags = toggleSelection(state.selectedSearchTags, searchTagButton.dataset.tagId);
      refresh();
      return;
    }

    var composeTagButton = event.target.closest('[data-tag-action="compose"]');
    if (composeTagButton) {
      state.selectedComposerTags = toggleSelection(state.selectedComposerTags, composeTagButton.dataset.tagId);
      refresh();
      return;
    }

    var removeComposerTag = event.target.closest("[data-remove-composer-tag]");
    if (removeComposerTag) {
      state.selectedComposerTags = state.selectedComposerTags.filter(function filterTag(id) {
        return id !== removeComposerTag.dataset.removeComposerTag;
      });
      refresh();
      return;
    }

    var deleteTagButton = event.target.closest("[data-admin-delete-tag]");
    if (deleteTagButton && isAdmin()) {
      await saveChange(function deleteTag() {
        return db.deleteTag(deleteTagButton.dataset.adminDeleteTag);
      }, "Tag removed from the platform.");
      return;
    }

    var deletePostButton = event.target.closest("[data-delete-post]");
    if (deletePostButton && isAdmin()) {
      await saveChange(function deletePost() {
        return db.deletePost(deletePostButton.dataset.deletePost);
      }, "Post deleted.");
      return;
    }

    var deleteReplyButton = event.target.closest("[data-delete-reply]");
    if (deleteReplyButton && isAdmin()) {
      await saveChange(function deleteReply() {
        return db.deleteReply(deleteReplyButton.dataset.deleteReply);
      }, "Reply deleted.");
      return;
    }

    var removePostTag = event.target.closest("[data-remove-post-tag]");
    if (removePostTag && isAdmin()) {
      var parts = removePostTag.dataset.removePostTag.split("::");
      await saveChange(function detachTag() {
        return db.detachTagFromPost(parts[0], parts[1]);
      }, "Tag removed from post.");
      return;
    }

    var clickTag = event.target.closest("[data-click-tag]");
    if (clickTag) {
      state.selectedSearchTags = [clickTag.dataset.clickTag];
      state.tagMenuOpen = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
      refresh();
      return;
    }
  }

  function handleStudentLogin(event) {
    event.preventDefault();
    var formData = new FormData(event.currentTarget);

    try {
      var student = db.authenticateStudent({
        email: formData.get("email"),
        password: formData.get("password")
      });
      state.currentUser = student;
      showMessage("Student login successful.", "success");
      refresh();
      event.currentTarget.reset();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function handleStudentSignup(event) {
    event.preventDefault();
    var formData = new FormData(event.currentTarget);

    try {
      var student = await db.createStudent({
        name: formData.get("name"),
        department: formData.get("department"),
        email: formData.get("email"),
        password: formData.get("password")
      });
      state.currentUser = student;
      showMessage("Account created and logged in successfully.", "success");
      refresh();
      event.currentTarget.reset();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function handleAdminLogin(event) {
    event.preventDefault();
    var formData = new FormData(event.currentTarget);

    try {
      var admin = db.authenticateAdmin({
        email: formData.get("email"),
        password: formData.get("password")
      });
      state.currentUser = admin;
      showMessage("Admin login successful.", "success");
      refresh();
      event.currentTarget.reset();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function handleTagCreate(event) {
    event.preventDefault();

    if (!isAdmin()) {
      showMessage("Only admins can create platform tags from the admin panel.", "error");
      return;
    }

    var formData = new FormData(event.currentTarget);

    try {
      await db.createTag({
        name: formData.get("name"),
        category: formData.get("category"),
        createdBy: state.currentUser.id
      });
      showMessage("Tag created successfully.", "success");
      event.currentTarget.reset();
      refresh();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function handleSearch() {
    state.searchQuery = elements.searchInput.value.trim();
    refresh();
  }

  function handleLogout() {
    state.currentUser = null;
    state.selectedComposerTags = [];
    showMessage("You have been logged out.", "success");
    refresh();
  }

  function clearFilters() {
    state.searchQuery = "";
    state.selectedSearchTags = [];
    elements.searchInput.value = "";
    refresh();
  }

  function bindEvents() {
    document.getElementById("studentLoginForm").addEventListener("submit", handleStudentLogin);
    document.getElementById("studentSignupForm").addEventListener("submit", handleStudentSignup);
    document.getElementById("adminLoginForm").addEventListener("submit", handleAdminLogin);
    document.getElementById("tagCreateForm").addEventListener("submit", handleTagCreate);
    document.getElementById("postForm").addEventListener("submit", handlePostSubmit);
    elements.searchBtn.addEventListener("click", handleSearch);
    elements.searchInput.addEventListener("keydown", function onKeyDown(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSearch();
      }
    });
    elements.clearFiltersBtn.addEventListener("click", clearFilters);
    elements.toggleTagMenuBtn.addEventListener("click", function toggleTagMenu() {
      state.tagMenuOpen = !state.tagMenuOpen;
      refresh();
    });
    elements.addNewTagBtn.addEventListener("click", addComposerTagByName);
    elements.logoutBtn.addEventListener("click", handleLogout);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("submit", function onSubmit(event) {
      if (event.target.matches("[data-reply-form]")) {
        handleReplySubmit(event);
        return;
      }
      if (event.target.matches("[data-admin-attach-form]")) {
        handleAdminAttachTag(event);
      }
    });
  }

  async function initializeApp() {
    await db.initialize();
    db.onChange(function handleSharedDataChange() {
      refresh();
    });
    bindEvents();
    setAuthTab(state.authTab);
    refresh();

    var status = db.getStorageStatus();
    if (!status.remoteReady) {
      showMessage(status.message, "error");
    }
  }

  initializeApp().catch(function handleStartupError(error) {
    console.error(error);
    showMessage("The forum could not start: " + error.message, "error");
  });
})();
