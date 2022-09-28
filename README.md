# js-code-view

Generate view output from JavaScript code.

Configured by writing a script that returns the HTML for the view. This can be either
run on Server or Client Page.

## Example code

Client page code:

Add one to output of a statistics view on the same page:

```
return +$('.TaskUniqueProject').html() +1
```

Server code:

Use `markupTags` to access markup tags, `db` to access database directly, `Table` to find tables. `user` and `req` are also in scope.

Same as above example, run on server (more verbose, same output)

```
const {script, domReady, div} = markupTags

return div({id:"helloworld"})+script(domReady(`
    const taskCount = +$('.TaskUniqueProject').html()
	$('#helloworld').html(taskCount+1)
`))
```
