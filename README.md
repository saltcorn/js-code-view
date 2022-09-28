# js-code-view

Generate view output from JavaScript code

## Example code

Add one to output of a statistics view on the same page:

```
const {script, domReady, div} = markupTags

return div({id:"helloworld"})+script(domReady(`
    const taskCount = +$('.TaskUniqueProject').html()
	$('#helloworld').html(taskCount+1)
`))
```

use `db` to access database directly, `Table` to find tables. `user` and `req` are also in scope.
