$(document).ready(() => {
    var url = searchType == "global" ? "/api/posts/global" : "/api/posts"

    $.get(url, { followingOnly: true }, results => {
        outputPosts(results, $(".postsContainer"));
    })
})


